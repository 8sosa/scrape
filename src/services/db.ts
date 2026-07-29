import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config } from '../config';
import type { NormalizedLead, ProcessedLeadRecord } from '../types';

const supabase: SupabaseClient = createClient(config.supabase.url, config.supabase.serviceRoleKey, {
  auth: { persistSession: false },
});

interface LeadIdRow {
  readonly lead_id: string;
}

/**
 * PostgREST's `.in()` filter puts every ID into the request URL
 * (`lead_id=in.(id1,id2,...)`). Several sources embed full URLs/slugs into
 * their lead IDs (We Work Remotely, Arbeitnow), so a single query across a
 * few hundred leads can exceed Supabase's request-size limit and 400. Chunk
 * the check instead — small enough that even all-long-ID batches stay well
 * under that limit.
 */
const DEDUP_BATCH_SIZE = 25;

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Filters a batch of leads down to those not yet present in processed_leads.
 * Runs one small batched `IN` query per chunk (in parallel) rather than one
 * round trip per lead or one giant query for everything.
 */
export async function filterUnprocessedLeads(leads: readonly NormalizedLead[]): Promise<readonly NormalizedLead[]> {
  if (leads.length === 0) {
    return [];
  }

  const batches = chunk(leads, DEDUP_BATCH_SIZE);

  const batchResults = await Promise.all(
    batches.map(async (batch): Promise<readonly NormalizedLead[]> => {
      const ids = batch.map((lead) => lead.leadId);
      const { data, error } = await supabase.from(config.supabase.table).select('lead_id').in('lead_id', ids);

      if (error) {
        console.error(`[db] Failed to check a batch of ${ids.length} processed lead(s), skipping this batch: ${error.message}`);
        // Fail closed for just this batch — a transient error here can't
        // flood Telegram, but it also doesn't take down every other batch.
        return [];
      }

      const existingIds = new Set((data as readonly LeadIdRow[]).map((row) => row.lead_id));
      return batch.filter((lead) => !existingIds.has(lead.leadId));
    }),
  );

  return batchResults.flat();
}

/** Records newly notified leads in a single batched insert so they are never alerted on again. */
export async function recordProcessedLeads(leads: readonly NormalizedLead[]): Promise<void> {
  if (leads.length === 0) {
    return;
  }

  const records: readonly ProcessedLeadRecord[] = leads.map((lead) => ({
    lead_id: lead.leadId,
    platform: lead.platform,
    channel: lead.channel,
    title: lead.title,
    url: lead.url,
  }));

  const { error } = await supabase.from(config.supabase.table).insert(records);

  if (error) {
    console.error(`[db] Failed to record ${records.length} processed lead(s): ${error.message}`);
    throw new Error(`Failed to persist processed leads: ${error.message}`);
  }
}
