import type { ApplicationMethod, NormalizedLead } from '../types';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

/** Words that, when found near an email address, strongly suggest it's the actual apply-to address rather than a footer/contact email. */
const APPLY_CONTEXT_REGEX = /(apply|send.{0,10}(resume|cv)|email.{0,10}(us|me|your)|contact|reach out)/i;

/**
 * Finds the best candidate "apply by email" address in a lead's text, if any.
 * Not source-restricted — a Reddit/HN post that says "email me at x@y.com"
 * qualifies just as much as a job listing that lists one. Prefers an address
 * appearing near apply-related language over the first one found, since
 * descriptions sometimes contain unrelated contact/footer addresses.
 */
function extractApplyEmail(text: string): string | null {
  const matches = [...text.matchAll(EMAIL_REGEX)];
  if (matches.length === 0) {
    return null;
  }

  for (const match of matches) {
    const start = Math.max(0, (match.index ?? 0) - 60);
    const end = Math.min(text.length, (match.index ?? 0) + match[0].length + 60);
    if (APPLY_CONTEXT_REGEX.test(text.slice(start, end))) {
      return match[0];
    }
  }

  return matches[0]?.[0] ?? null;
}

export interface ResolvedApplyTarget {
  readonly method: ApplicationMethod;
  readonly target: string;
}

/** Decides how to apply to a lead: email if the text names one, otherwise the lead's own URL. */
export function resolveApplyTarget(lead: NormalizedLead): ResolvedApplyTarget {
  const email = extractApplyEmail(`${lead.title}\n${lead.body}`);
  if (email) {
    return { method: 'email', target: email };
  }
  return { method: 'external-link', target: lead.url };
}
