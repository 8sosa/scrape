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

  // Anything older than the freshness window is dropped from consideration
  // entirely — this is also the backlog control: an unsent lead just ages
  // out on its own in a later run instead of being deferred forever, so a
  // growing backlog can never bury genuinely new leads.
  const freshnessWindowSeconds = config.resumeMatch.freshnessWindowHours * 3600;
  const nowSeconds = Math.floor(Date.now() / 1000);
  const freshLeads = highIntentLeads.filter((lead) => nowSeconds - lead.createdUtc <= freshnessWindowSeconds);
  console.log(`[pipeline] ${freshLeads.length} leads are within the ${config.resumeMatch.freshnessWindowHours}h freshness window`);

  const matchByLeadId = new Map<string, LeadMatch>();
  const wellMatchedLeads = freshLeads.filter((lead) => {
    const match = scoreLead(lead);
    matchByLeadId.set(lead.leadId, match);
    return match.score >= config.resumeMatch.minScore;
  });
  console.log(`[pipeline] ${wellMatchedLeads.length} leads score >= ${config.resumeMatch.minScore}/10 against the resume`);

  const newLeads = await filterUnprocessedLeads(wellMatchedLeads);
  console.log(`[pipeline] ${newLeads.length} leads are new (not previously notified)`);

  // Highest fit score first (freshest as tie-breaker), capped so a large
  // batch can't blow the serverless time budget or Telegram's flood limit in
  // one run. Anything past the cap simply isn't recorded as processed, so
  // it's picked up again — and re-ranked — on the next run (or ages out of
  // the freshness window before that happens, which is fine).
  const sortedByScore = [...newLeads].sort((a, b) => {
    const scoreDiff = (matchByLeadId.get(b.leadId)?.score ?? 0) - (matchByLeadId.get(a.leadId)?.score ?? 0);
    return scoreDiff !== 0 ? scoreDiff : b.createdUtc - a.createdUtc;
  });
  const leadsToNotify = sortedByScore.slice(0, config.pipeline.maxNotificationsPerRun);
  const deferredCount = sortedByScore.length - leadsToNotify.length;
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
    freshEnough: freshLeads.length,
    wellMatched: wellMatchedLeads.length,
    new: newLeads.length,
    notified: notifiedLeads.length,
    deferred: deferredCount,
  };
}
