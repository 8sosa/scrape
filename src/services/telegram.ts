import axios, { AxiosError } from 'axios';
import { config } from '../config';
import type { NormalizedLead } from '../types';

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
      return 'Hacker News';
    case 'remoteok':
      return `RemoteOK — ${lead.channel}`;
    case 'weworkremotely':
      return `We Work Remotely — ${lead.channel}`;
  }
}

/** "Author" reads as a Reddit username only for Reddit leads; other platforms show a company/poster name. */
function formatAuthorLine(lead: NormalizedLead): string {
  return lead.platform === 'reddit' ? `u/${lead.author}` : lead.author;
}

function formatLeadMessage(lead: NormalizedLead): string {
  const snippet = buildSnippet(lead.body);

  return [
    '🚨 *NEW BUYING INTENT LEAD DETECTED*',
    `📌 *Title:* ${escapeMarkdown(lead.title)}`,
    `📍 *Source:* ${escapeMarkdown(formatSourceLine(lead))}`,
    `👤 *Author:* ${escapeMarkdown(formatAuthorLine(lead))}`,
    `🔗 *Link:* ${lead.url}`,
    `📝 *Snippet:* ${escapeMarkdown(snippet)}`,
  ].join('\n');
}

interface TelegramSendMessageResponse {
  readonly ok: boolean;
  readonly description?: string;
}

/** Sends a single formatted lead alert to the configured Telegram chat/channel. */
export async function sendLeadNotification(lead: NormalizedLead): Promise<boolean> {
  const url = `${config.telegram.apiBaseUrl}/bot${config.telegram.botToken}/sendMessage`;
  const text = formatLeadMessage(lead);

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
      return false;
    }

    console.log(`[telegram] Sent alert for lead_id=${lead.leadId} (${lead.platform})`);
    return true;
  } catch (error) {
    const axiosError = error as AxiosError<TelegramSendMessageResponse>;
    const description = axiosError.response?.data?.description ?? axiosError.message;
    console.error(`[telegram] Failed to send alert for lead_id=${lead.leadId}: ${description}`);
    return false;
  }
}
