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
 * Filters a batch of leads down to those not yet present in processed_leads,
 * using a single batched `IN` query rather than one round trip per lead —
 * important for staying inside a serverless function's execution budget.
 */
export async function filterUnprocessedLeads(leads: readonly NormalizedLead[]): Promise<readonly NormalizedLead[]> {
  if (leads.length === 0) {
    return [];
  }

  const leadIds = leads.map((lead) => lead.leadId);
  const { data, error } = await supabase.from(config.supabase.table).select('lead_id').in('lead_id', leadIds);

  if (error) {
    console.error(`[db] Failed to check processed leads: ${error.message}`);
    // Fail closed on the side of "already processed" so a transient DB error
    // cannot flood the Telegram channel with duplicate/erroneous alerts.
    return [];
  }

  const existingIds = new Set((data as readonly LeadIdRow[]).map((row) => row.lead_id));
  return leads.filter((lead) => !existingIds.has(lead.leadId));
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
