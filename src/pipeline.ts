import { leadSources } from './services/sources';
import { filterHighIntentLeads } from './services/filter';
import { filterUnprocessedLeads, recordProcessedLeads } from './services/db';
import { sendLeadNotification } from './services/telegram';
import { sleep } from './utils/sleep';
import type { NormalizedLead, PipelineRunSummary } from './types';

// Telegram recommends no more than ~1 message/second to the same chat to avoid flood limits.
const TELEGRAM_SEND_INTERVAL_MS = 350;

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

  const newLeads = await filterUnprocessedLeads(highIntentLeads);
  console.log(`[pipeline] ${newLeads.length} leads are new (not previously notified)`);

  const notifiedLeads: NormalizedLead[] = [];
  for (const [index, lead] of newLeads.entries()) {
    const sent = await sendLeadNotification(lead);
    if (sent) {
      notifiedLeads.push(lead);
    }
    if (index < newLeads.length - 1) {
      await sleep(TELEGRAM_SEND_INTERVAL_MS);
    }
  }

  try {
    // Only leads that were actually sent get recorded — a failed send should
    // retry on the next run rather than being silently marked as processed.
    await recordProcessedLeads(notifiedLeads);
  } catch (error) {
    console.error('[pipeline] Failed to persist notified leads (risk of a duplicate alert next run):', error);
  }

  console.log(`[pipeline] Run completed at ${new Date().toISOString()}`);

  return {
    fetched: allLeads.length,
    matched: highIntentLeads.length,
    new: newLeads.length,
    notified: notifiedLeads.length,
  };
}
