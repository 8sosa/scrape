import { config } from './config';
import { leadSources } from './services/sources';
import { filterHighIntentLeads } from './services/filter';
import { attachTelegramMessage, filterUnprocessedLeads, releaseLead, saveDraftApplication, tryClaimLead } from './services/db';
import { scoreLead } from './services/resumeMatch';
import { resolveApplyTarget } from './services/applyMethod';
import { generateCoverNote } from './services/coverNoteDraft';
import { sendLeadNotification } from './services/telegram';
import { sleep } from './utils/sleep';
import type { DraftApplication, LeadMatch, NormalizedLead, PipelineRunSummary } from './types';

/** Builds and persists a draft application for a lead, or undefined if persistence fails (the lead is still notified, just without approve/skip buttons). */
async function buildDraft(lead: NormalizedLead, match: LeadMatch): Promise<DraftApplication | undefined> {
  const applyTarget = resolveApplyTarget(lead);
  const coverNote = await generateCoverNote(lead, match);

  const draftId = await saveDraftApplication({
    leadId: lead.leadId,
    method: applyTarget.method,
    target: applyTarget.target,
    title: lead.title,
    coverNote,
  });

  if (!draftId) {
    return undefined;
  }

  return {
    id: draftId,
    leadId: lead.leadId,
    method: applyTarget.method,
    target: applyTarget.target,
    title: lead.title,
    coverNote,
    status: 'pending',
  };
}

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

  // Claim BEFORE sending — the atomic insert is what actually prevents two
  // overlapping invocations (an overlapping schedule, a manual re-trigger
  // mid-run, etc.) from both sending the same lead. Claims run in parallel
  // since each is an independent, cheap DB insert.
  const claimResults = await Promise.all(leadsToNotify.map(async (lead) => ({ lead, claimed: await tryClaimLead(lead) })));
  const claimedLeads = claimResults.filter((r) => r.claimed).map((r) => r.lead);

  // Draft generation (a real Claude API call per lead) is the slow step —
  // run it in parallel across every claimed lead instead of one at a time
  // inside the send loop. Sequentially, N leads at several seconds each for
  // a cover note blows the serverless time budget; in parallel it costs
  // roughly the slowest single call, not the sum of all of them.
  const draftsByLeadId = new Map<string, DraftApplication | undefined>();
  await Promise.all(
    claimedLeads.map(async (lead) => {
      const match = matchByLeadId.get(lead.leadId) ?? { score: 0, matchedSkills: [], mentionedSkills: [] };
      draftsByLeadId.set(lead.leadId, await buildDraft(lead, match));
    }),
  );

  // Sending itself must stay sequential — Telegram's flood limit is on send rate, not total volume.
  const notifiedLeads: NormalizedLead[] = [];
  for (const lead of claimedLeads) {
    const match = matchByLeadId.get(lead.leadId) ?? { score: 0, matchedSkills: [], mentionedSkills: [] };
    const draft = draftsByLeadId.get(lead.leadId);
    const outcome = await sendLeadNotification(lead, match, draft);

    if (outcome.result === 'sent') {
      notifiedLeads.push(lead);
      if (draft && outcome.messageId) {
        await attachTelegramMessage(draft.id, config.telegram.chatId, outcome.messageId);
      }
    }

    if (outcome.result === 'flood-limited') {
      console.warn(
        `[pipeline] Telegram flood limit hit after ${notifiedLeads.length} send(s) this run; stopping early — the rest are deferred to the next run.`,
      );
      break;
    }

    await sleep(config.pipeline.telegramSendIntervalMs);
  }

  // Release every claimed lead that never actually got delivered — failed
  // sends, flood-limited sends, and anything never reached because of an
  // early break — so all of them are retried (and re-ranked) on a future
  // run instead of being silently stuck as "processed" forever.
  const notifiedLeadIds = new Set(notifiedLeads.map((lead) => lead.leadId));
  const unsentLeads = claimedLeads.filter((lead) => !notifiedLeadIds.has(lead.leadId));
  await Promise.all(unsentLeads.map((lead) => releaseLead(lead.leadId)));

  console.log(`[pipeline] Run completed at ${new Date().toISOString()}`);

  return {
    fetched: allLeads.length,
    matched: highIntentLeads.length,
    new: newLeads.length,
    notified: notifiedLeads.length,
    deferred: deferredCount,
  };
}
