import { config } from './config';
import { leadSources } from './services/sources';
import { filterHighIntentLeads } from './services/filter';
import { filterUnprocessedLeads, recordProcessedLeads } from './services/db';
import { scoreLead } from './services/resumeMatch';
import { sendLeadNotification } from './services/telegram';
import { sleep } from './utils/sleep';
import type { LeadMatch, NormalizedLead, PipelineRunSummary } from './types';

/** Runs one full fetch (all sources, in parallel) -> filter -> dedupe -> notify cycle. */
export async function runPipeline(): Promise<PipelineRunSummary> {
  const startedAt = new Date().toISOString();
  console.log(`\n[pipeline] Run started at ${startedAt}`);

  const results = await Promise.allSettled(leadSources.map((source) => source.fetchLatest()));

  const allLeads: NormalizedLead[] = [];
  results.forEach((result, index) => {
    const source = leadSources[index];
    if (!source) {
      return;
    }
    if (result.status === 'fulfilled') {
      console.log(`[pipeline] ${source.platform}: fetched ${result.value.length} lead(s)`);
      allLeads.push(...result.value);
    } else {
      console.error(`[pipeline] ${source.platform}: fetch failed:`, result.reason);
    }
  });
  console.log(`[pipeline] Fetched ${allLeads.length} total leads across ${leadSources.length} sources`);

  const highIntentLeads = filterHighIntentLeads(allLeads);
  console.log(`[pipeline] ${highIntentLeads.length} leads matched high-intent filters`);

  // Every matched lead gets scored against the resume, but the score is only
  // ever a sort factor, never a cutoff — a low-scoring lead still gets sent,
  // just later, rather than being silently dropped.
  const matchByLeadId = new Map<string, LeadMatch>();
  for (const lead of highIntentLeads) {
    matchByLeadId.set(lead.leadId, scoreLead(lead));
  }

  const newLeads = await filterUnprocessedLeads(highIntentLeads);
  console.log(`[pipeline] ${newLeads.length} leads are new (not previously notified)`);

  // Most recent first (fit score as tie-breaker only) — no hard age cutoff.
  // Capped so a large batch can't blow the serverless time budget or
  // Telegram's flood limit in one run. Anything past the cap simply isn't
  // recorded as processed, so it's picked up again next run, naturally
  // out-ranked once fresher leads show up.
  const sortedByRecency = [...newLeads].sort((a, b) => {
    const recencyDiff = b.createdUtc - a.createdUtc;
    return recencyDiff !== 0 ? recencyDiff : (matchByLeadId.get(b.leadId)?.score ?? 0) - (matchByLeadId.get(a.leadId)?.score ?? 0);
  });
  const leadsToNotify = sortedByRecency.slice(0, config.pipeline.maxNotificationsPerRun);
  const deferredCount = sortedByRecency.length - leadsToNotify.length;
  if (deferredCount > 0) {
    console.warn(
      `[pipeline] Capping notifications at ${config.pipeline.maxNotificationsPerRun} this run; ${deferredCount} lower-priority new lead(s) deferred to a future run.`,
    );
  }

  const notifiedLeads: NormalizedLead[] = [];
  for (const lead of leadsToNotify) {
    const match = matchByLeadId.get(lead.leadId);
    const result = await sendLeadNotification(lead, match);

    if (result === 'flood-limited') {
      console.warn(
        `[pipeline] Telegram flood limit hit after ${notifiedLeads.length} send(s) this run; stopping early — the rest are deferred to the next run.`,
      );
      break;
    }

    if (result === 'sent') {
      notifiedLeads.push(lead);
      try {
        // Recorded immediately, not batched at the end — if this run gets
        // killed by the platform mid-loop (e.g. hitting the timeout), every
        // lead already sent is already durably marked processed, so it can
        // never be re-sent as a duplicate on the next run.
        await recordProcessedLeads([lead]);
      } catch (error) {
        console.error(`[pipeline] Failed to persist lead ${lead.leadId} right after sending (risk of a duplicate alert next run):`, error);
      }
    }

    await sleep(config.pipeline.telegramSendIntervalMs);
  }

  console.log(`[pipeline] Run completed at ${new Date().toISOString()}`);

  return {
    fetched: allLeads.length,
    matched: highIntentLeads.length,
    new: newLeads.length,
    notified: notifiedLeads.length,
    deferred: deferredCount,
  };
}
