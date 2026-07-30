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
      const { data, error } = await supabase.from(config.supabase.table).select('lead_id').eq('tenant', config.tenant).in('lead_id', ids);

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

/** Postgres unique_violation — the code path that means "another invocation already claimed this". */
const UNIQUE_VIOLATION = '23505';

/**
 * Atomically claims a lead by inserting it into processed_leads BEFORE
 * sending any notification for it. `filterUnprocessedLeads` is only a
 * best-effort pre-filter — under overlapping/concurrent invocations (two
 * scheduled runs overlapping, a manual re-trigger while one is still in
 * flight, etc.) two runs can both see the same lead as "not yet processed"
 * in that check. The unique constraint on (tenant, lead_id) is the actual
 * source of truth: whichever invocation's insert lands first wins the lead,
 * and the other gets a 23505 back here — BEFORE it has sent anything — so
 * only one Telegram message ever goes out per lead, however many runs are
 * overlapping. Scoping by tenant means two independent deployments sharing
 * one Supabase project each get their own claim on the same lead_id instead
 * of racing each other for it.
 */
export async function tryClaimLead(lead: NormalizedLead): Promise<boolean> {
  const record: ProcessedLeadRecord = {
    tenant: config.tenant,
    lead_id: lead.leadId,
    platform: lead.platform,
    channel: lead.channel,
    title: lead.title,
    url: lead.url,
  };

  const { error } = await supabase.from(config.supabase.table).insert(record);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return false;
    }
    console.error(`[db] Failed to claim lead ${lead.leadId}, skipping it this run: ${error.message}`);
    // Fail closed — an unclaimed lead is simply reconsidered next run rather
    // than risking a duplicate send on an ambiguous DB error.
    return false;
  }

  return true;
}

/** Releases a claimed lead so it's retried on a future run, e.g. after its Telegram send actually failed. */
export async function releaseLead(leadId: string): Promise<void> {
  const { error } = await supabase.from(config.supabase.table).delete().eq('tenant', config.tenant).eq('lead_id', leadId);

  if (error) {
    console.error(`[db] Failed to release lead ${leadId} after a failed send (it won't be retried): ${error.message}`);
  }
}
