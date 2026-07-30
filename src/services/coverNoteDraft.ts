import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';
import { RESUME_SKILLS } from '../config/skills';
import type { LeadMatch, NormalizedLead } from '../types';

let cachedClient: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!config.anthropic.apiKey) {
    return null;
  }
  if (!cachedClient) {
    // The SDK's defaults (10-minute timeout, 2 retries) are far too generous
    // for a serverless function on a 30s budget — a single slow/hanging call
    // could eat the whole run. Bounded tightly here; a timeout or failed
    // retry just falls through to the deterministic fallback note below.
    cachedClient = new Anthropic({ apiKey: config.anthropic.apiKey, timeout: 8_000, maxRetries: 1 });
  }
  return cachedClient;
}

const SYSTEM_PROMPT = [
  "You write short, genuine outreach cover notes for a freelance/contract software developer applying to job leads.",
  'Write only the cover note body text — no subject line, no markdown formatting, no placeholders like "[Your Name]".',
  'Do not include internal or system XML tags in your response.',
].join(' ');

function buildFallbackNote(lead: NormalizedLead, skillsList: string): string {
  return `Hi, I'm a full-stack developer with hands-on experience in ${skillsList}. I saw your posting for "${lead.title}" and wanted to reach out directly — I'd love to help. Happy to share more about my background whenever convenient.`;
}

/**
 * Drafts a short cover note tailored to the lead and the resume's matched
 * skills. Falls back to a deterministic template if no ANTHROPIC_API_KEY is
 * configured, Claude declines the request, or the call fails — the approval
 * flow always has something to show, generated or not.
 */
export async function generateCoverNote(lead: NormalizedLead, match: LeadMatch): Promise<string> {
  const skillsList = match.matchedSkills.length > 0 ? match.matchedSkills.join(', ') : RESUME_SKILLS.slice(0, 8).join(', ');

  const client = getClient();
  if (!client) {
    return buildFallbackNote(lead, skillsList);
  }

  const prompt = [
    `Job title: ${lead.title}`,
    `Company/poster: ${lead.author}`,
    'Job description (may be partial):',
    lead.body.slice(0, 1500),
    '',
    `My relevant skills for this role: ${skillsList}`,
    '',
    'Write a concise (120-180 word) cover note applying for this role, referencing the specific role and 2-3 of my listed skills naturally. Sound like a real person, not a template.',
  ].join('\n');

  try {
    const response = await client.messages.create({
      model: config.anthropic.model,
      max_tokens: 500,
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: prompt }],
    });

    if (response.stop_reason === 'refusal') {
      console.warn(`[coverNoteDraft] Claude declined to draft a note for lead ${lead.leadId}`);
      return buildFallbackNote(lead, skillsList);
    }

    let text = '';
    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      }
    }

    return text.trim() || buildFallbackNote(lead, skillsList);
  } catch (error) {
    console.error(`[coverNoteDraft] Failed to generate cover note for lead ${lead.leadId}: ${(error as Error).message}`);
    return buildFallbackNote(lead, skillsList);
  }
}
