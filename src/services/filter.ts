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
function evaluateHiringOnlySubreddit(lead: NormalizedLead): FilterResult {
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
 * Evaluated by free-text keyword matching against the configured high-intent
 * trigger phrases, with self-promotional content excluded regardless of
 * trigger matches. Used for every source except the [HIRING]-tagged subreddits.
 */
function evaluateByKeywords(lead: NormalizedLead): FilterResult {
  const combinedText = `${lead.title}\n${lead.body}`.toLowerCase();

  const hasExclusion = config.exclusionTerms.some((term) => containsPhrase(combinedText, term));
  if (hasExclusion) {
    return { isMatch: false, matchedTriggers: [] };
  }

  const matchedTriggers = config.triggerKeywords.filter((keyword) => containsPhrase(combinedText, keyword));

  return { isMatch: matchedTriggers.length > 0, matchedTriggers };
}

/** Evaluates a single normalized lead against the high-intent filtering rules. */
export function evaluateLead(lead: NormalizedLead): FilterResult {
  const isHiringOnlySubreddit =
    lead.platform === 'reddit' &&
    config.reddit.hiringOnlySubreddits.some((subreddit) => subreddit.toLowerCase() === lead.channel.toLowerCase());

  return isHiringOnlySubreddit ? evaluateHiringOnlySubreddit(lead) : evaluateByKeywords(lead);
}

/** Filters a batch of leads down to those that represent genuine, high-intent buying signals. */
export function filterHighIntentLeads(leads: readonly NormalizedLead[]): readonly NormalizedLead[] {
  return leads.filter((lead) => evaluateLead(lead).isMatch);
}
