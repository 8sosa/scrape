import axios, { AxiosError } from 'axios';
import { config } from '../config';
import type { ApplicationMethod, DraftApplication, LeadMatch, NormalizedLead } from '../types';

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

function formatApplyLine(method: ApplicationMethod, target: string): string {
  return method === 'email' ? `Email — ${target}` : 'External link (see 🔗 above)';
}

function formatLeadMessage(lead: NormalizedLead, match: LeadMatch | undefined, draft: DraftApplication | undefined): string {
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

  if (draft) {
    lines.push(
      '',
      `✍️ *Draft cover note:*\n${escapeMarkdown(draft.coverNote)}`,
      '',
      `📤 *Apply via:* ${escapeMarkdown(formatApplyLine(draft.method, draft.target))}`,
    );
  }

  return lines.join('\n');
}

interface TelegramApiResponse<T = unknown> {
  readonly ok: boolean;
  readonly description?: string;
  readonly error_code?: number;
  readonly parameters?: { readonly retry_after?: number };
  readonly result?: T;
}

interface TelegramMessageResult {
  readonly message_id: number;
}

/**
 * 'flood-limited' is distinguished from a plain 'failed' so the pipeline can
 * stop sending entirely for this run — once Telegram 429s a chat, every
 * subsequent send in the same run will too, so retrying into it just burns
 * the function's time budget for nothing.
 */
export type SendResult = 'sent' | 'failed' | 'flood-limited';

export interface SendOutcome {
  readonly result: SendResult;
  /** The sent message's ID, present only when result === 'sent' — needed to attach approve/skip buttons to a draft row. */
  readonly messageId?: number;
}

function botUrl(method: string): string {
  return `${config.telegram.apiBaseUrl}/bot${config.telegram.botToken}/${method}`;
}

function draftInlineKeyboard(draft: DraftApplication) {
  const approveLabel = draft.method === 'email' ? '✅ Approve & Send Email' : '✅ Approve';
  return {
    inline_keyboard: [
      [
        { text: approveLabel, callback_data: `approve:${draft.id}` },
        { text: '❌ Skip', callback_data: `skip:${draft.id}` },
      ],
    ],
  };
}

/**
 * Sends a lead alert to the configured Telegram chat/channel. When `draft` is
 * provided, the message includes the drafted cover note and Approve/Skip
 * inline buttons instead of being a plain notification.
 */
export async function sendLeadNotification(
  lead: NormalizedLead,
  match?: LeadMatch,
  draft?: DraftApplication,
): Promise<SendOutcome> {
  const text = formatLeadMessage(lead, match, draft);

  try {
    const response = await axios.post<TelegramApiResponse<TelegramMessageResult>>(
      botUrl('sendMessage'),
      {
        chat_id: config.telegram.chatId,
        text,
        parse_mode: 'Markdown',
        disable_web_page_preview: false,
        ...(draft ? { reply_markup: draftInlineKeyboard(draft) } : {}),
      },
      { timeout: 8_000 },
    );

    if (!response.data.ok) {
      console.error(`[telegram] API rejected message for lead_id=${lead.leadId}: ${response.data.description ?? 'unknown error'}`);
      return { result: 'failed' };
    }

    console.log(`[telegram] Sent alert for lead_id=${lead.leadId} (${lead.platform})`);
    const messageId = response.data.result?.message_id;
    return messageId !== undefined ? { result: 'sent', messageId } : { result: 'sent' };
  } catch (error) {
    const axiosError = error as AxiosError<TelegramApiResponse>;
    const description = axiosError.response?.data?.description ?? axiosError.message;

    if (axiosError.response?.status === 429) {
      console.error(`[telegram] Flood limited sending lead_id=${lead.leadId}: ${description}`);
      return { result: 'flood-limited' };
    }

    console.error(`[telegram] Failed to send alert for lead_id=${lead.leadId}: ${description}`);
    return { result: 'failed' };
  }
}

/** Edits a previously-sent message (used after an Approve/Skip decision) and clears its inline keyboard. */
export async function editMessageAfterDecision(chatId: string, messageId: number, originalText: string, statusLine: string): Promise<void> {
  try {
    await axios.post(
      botUrl('editMessageText'),
      {
        chat_id: chatId,
        message_id: messageId,
        text: `${originalText}\n\n${statusLine}`,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] },
      },
      { timeout: 8_000 },
    );
  } catch (error) {
    const axiosError = error as AxiosError<TelegramApiResponse>;
    console.error(`[telegram] Failed to edit message ${messageId} in chat ${chatId}: ${axiosError.response?.data?.description ?? axiosError.message}`);
  }
}

/** Acknowledges a callback query so Telegram stops showing the button's loading spinner. */
export async function answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
  try {
    await axios.post(botUrl('answerCallbackQuery'), { callback_query_id: callbackQueryId, text }, { timeout: 8_000 });
  } catch (error) {
    const axiosError = error as AxiosError<TelegramApiResponse>;
    console.error(`[telegram] Failed to answer callback query ${callbackQueryId}: ${axiosError.response?.data?.description ?? axiosError.message}`);
  }
}
