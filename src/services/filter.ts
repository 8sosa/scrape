import { config } from '../config';
import type { FilterResult, NormalizedLead } from '../types';

const HIRING_TAG = '[hiring]';
const FOR_HIRE_TAG = '[for hire]';

function containsPhrase(haystack: string, phrase: string): boolean {
  return haystack.includes(phrase.toLowerCase());
}

/**
 * r/forhire and r/freelance_forhire use a strict tag convention: posts are
 * either [HIRING] (a buyer seeking a developer) or [FOR HIRE] (a developer
 * advertising themselves). Free-text keyword matching is unreliable here, so
 * we gate purely on the tag and discard [FOR HIRE] posts outright.
 */
function evaluateStrictHiringTag(lead: NormalizedLead): FilterResult {
  const title = lead.title.toLowerCase();

  if (title.includes(FOR_HIRE_TAG)) {
    return { isMatch: false, matchedTriggers: [] };
  }

  if (title.includes(HIRING_TAG)) {
    return { isMatch: true, matchedTriggers: [HIRING_TAG] };
  }

  return { isMatch: false, matchedTriggers: [] };
}

/**
 * Free-form discussion content (general subreddits, HN front page) needs an
 * explicit high-intent phrase to separate "someone is hiring" from ordinary
 * noise, with self-promotional posts excluded regardless of trigger matches.
 */
function evaluateIntentPhrase(lead: NormalizedLead): FilterResult {
  const combinedText = `${lead.title}\n${lead.body}`.toLowerCase();

  if (config.exclusionTerms.some((term) => containsPhrase(combinedText, term))) {
    return { isMatch: false, matchedTriggers: [] };
  }

  const matchedTriggers = config.triggerKeywords.filter((keyword) => containsPhrase(combinedText, keyword));
  return { isMatch: matchedTriggers.length > 0, matchedTriggers };
}

/**
 * Job-board-shaped sources (RemoteOK, WWR, Remotive, Arbeitnow, HN
 * hiring/freelancer threads) are already hiring posts by construction — they
 * never phrase themselves as "looking for a developer". Relevance to the
 * dev/web stack is the right bar here, not intent phrasing.
 */
function evaluateStackRelevance(lead: NormalizedLead): FilterResult {
  const combinedText = `${lead.title}\n${lead.body}`.toLowerCase();

  if (config.exclusionTerms.some((term) => containsPhrase(combinedText, term))) {
    return { isMatch: false, matchedTriggers: [] };
  }

  const matchedTriggers = config.devRelevanceKeywords.filter((keyword) => containsPhrase(combinedText, keyword));
  return { isMatch: matchedTriggers.length > 0, matchedTriggers };
}

/** Evaluates a single normalized lead against the high-intent filtering rules for its mode. */
export function evaluateLead(lead: NormalizedLead): FilterResult {
  switch (lead.filterMode) {
    case 'strict-hiring-tag':
      return evaluateStrictHiringTag(lead);
    case 'intent-phrase':
      return evaluateIntentPhrase(lead);
    case 'stack-relevance':
      return evaluateStackRelevance(lead);
    default: {
      const exhaustiveCheck: never = lead.filterMode;
      throw new Error(`Unhandled filter mode: ${String(exhaustiveCheck)}`);
    }
  }
}

/** Filters a batch of leads down to those that represent genuine, high-intent buying signals. */
export function filterHighIntentLeads(leads: readonly NormalizedLead[]): readonly NormalizedLead[] {
  return leads.filter((lead) => evaluateLead(lead).isMatch);
}
