import axios, { AxiosError } from 'axios';
import { config } from '../config';
import type { LeadMatch, NormalizedLead } from '../types';

const SNIPPET_LENGTH = 250;

/**
 * Telegram's legacy "Markdown" parse mode treats _ * ` [ as formatting
 * characters. User-generated content (titles, authors, snippets) must have
 * these escaped so a stray `[` or `_` in a post doesn't break parsing or
 * silently swallow part of the message.
 */
function escapeMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, '\\$1');
}

function buildSnippet(body: string): string {
  const trimmed = body.trim();
  if (trimmed.length === 0) {
    return '(no description text)';
  }
  const truncated = trimmed.slice(0, SNIPPET_LENGTH);
  return trimmed.length > SNIPPET_LENGTH ? `${truncated}...` : truncated;
}

/** Human-readable "Source" line, varying by platform since not every source has a subreddit-style channel. */
function formatSourceLine(lead: NormalizedLead): string {
  switch (lead.platform) {
    case 'reddit':
      return `Reddit — r/${lead.channel}`;
    case 'hackernews':
      return lead.channel;
    case 'remoteok':
      return `RemoteOK — ${lead.channel}`;
    case 'weworkremotely':
      return `We Work Remotely — ${lead.channel}`;
    case 'remotive':
      return `Remotive — ${lead.channel}`;
    case 'arbeitnow':
      return `Arbeitnow — ${lead.channel}`;
    case 'jobicy':
      return `Jobicy — ${lead.channel}`;
    case 'himalayas':
      return `Himalayas — ${lead.channel}`;
    case 'workingnomads':
      return `Working Nomads — ${lead.channel}`;
    default: {
      const exhaustiveCheck: never = lead.platform;
      throw new Error(`Unhandled platform: ${String(exhaustiveCheck)}`);
    }
  }
}

/** "Author" reads as a Reddit username only for Reddit leads; other platforms show a company/poster name. */
function formatAuthorLine(lead: NormalizedLead): string {
  return lead.platform === 'reddit' ? `u/${lead.author}` : lead.author;
}

function formatFitLine(match: LeadMatch): string {
  const skillsPart = match.matchedSkills.length > 0 ? match.matchedSkills.join(', ') : 'no specific skills recognized';
  return `${match.score}/10 — ${skillsPart}`;
}

function formatLeadMessage(lead: NormalizedLead, match: LeadMatch | undefined): string {
  const snippet = buildSnippet(lead.body);

  const lines = [
    '🚨 *NEW BUYING INTENT LEAD DETECTED*',
    `📌 *Title:* ${escapeMarkdown(lead.title)}`,
    `📍 *Source:* ${escapeMarkdown(formatSourceLine(lead))}`,
  ];

  if (match) {
    lines.push(`🎯 *Fit:* ${escapeMarkdown(formatFitLine(match))}`);
  }

  lines.push(
    `👤 *Author:* ${escapeMarkdown(formatAuthorLine(lead))}`,
    `🔗 *Link:* ${lead.url}`,
    `📝 *Snippet:* ${escapeMarkdown(snippet)}`,
  );

  return lines.join('\n');
}

interface TelegramSendMessageResponse {
  readonly ok: boolean;
  readonly description?: string;
  readonly error_code?: number;
  readonly parameters?: { readonly retry_after?: number };
}

/**
 * 'flood-limited' is distinguished from a plain 'failed' so the pipeline can
 * stop sending entirely for this run — once Telegram 429s a chat, every
 * subsequent send in the same run will too, so retrying into it just burns
 * the function's time budget for nothing.
 */
export type SendResult = 'sent' | 'failed' | 'flood-limited';

/** Sends a single formatted lead alert to the configured Telegram chat/channel. */
export async function sendLeadNotification(lead: NormalizedLead, match?: LeadMatch): Promise<SendResult> {
  const url = `${config.telegram.apiBaseUrl}/bot${config.telegram.botToken}/sendMessage`;
  const text = formatLeadMessage(lead, match);

  try {
    const response = await axios.post<TelegramSendMessageResponse>(
      url,
      {
        chat_id: config.telegram.chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
      },
      { timeout: 8_000 },
    );

    if (!response.data.ok) {
      console.error(`[telegram] API rejected message for lead_id=${lead.leadId}: ${response.data.description ?? 'unknown error'}`);
      return 'failed';
    }

    console.log(`[telegram] Sent alert for lead_id=${lead.leadId} (${lead.platform})`);
    return 'sent';
  } catch (error) {
    const axiosError = error as AxiosError<TelegramSendMessageResponse>;
    const description = axiosError.response?.data?.description ?? axiosError.message;

    if (axiosError.response?.status === 429) {
      console.error(`[telegram] Flood limited sending lead_id=${lead.leadId}: ${description}`);
      return 'flood-limited';
    }

    console.error(`[telegram] Failed to send alert for lead_id=${lead.leadId}: ${description}`);
    return 'failed';
  }
}
