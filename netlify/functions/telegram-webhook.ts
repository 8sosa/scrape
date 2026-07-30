import { config } from '../../src/config';
import { getDraftApplication, updateDraftStatus } from '../../src/services/db';
import { answerCallbackQuery, editMessageAfterDecision } from '../../src/services/telegram';
import { sendApplicationEmail } from '../../src/services/emailSender';

interface TelegramCallbackQuery {
  readonly id: string;
  readonly data?: string;
  readonly message?: {
    readonly message_id: number;
    readonly text?: string;
    readonly chat: { readonly id: number };
  };
}

interface TelegramUpdate {
  readonly callback_query?: TelegramCallbackQuery;
}

/**
 * Receives Telegram's webhook callback for the Approve/Skip inline buttons
 * on draft-application messages. Register this URL with Telegram via
 * `setWebhook` (see the setup notes) — this is a plain HTTP-triggered
 * function, not a scheduled one, so it has no `config.schedule` export.
 */
export default async (req: Request): Promise<Response> => {
  // Fail closed: without a configured secret, or on a mismatch, refuse the
  // request outright rather than acting on an unverified callback.
  const providedSecret = req.headers.get('x-telegram-bot-api-secret-token');
  if (!config.telegram.webhookSecret || providedSecret !== config.telegram.webhookSecret) {
    console.error('[telegram-webhook] Rejected request: missing/invalid secret token');
    return new Response('Forbidden', { status: 403 });
  }

  let update: TelegramUpdate;
  try {
    update = (await req.json()) as TelegramUpdate;
  } catch {
    return new Response('Bad Request', { status: 400 });
  }

  const callback = update.callback_query;
  if (!callback || !callback.message) {
    return new Response('OK');
  }

  const [action, draftId] = (callback.data ?? '').split(':');
  if (!draftId || (action !== 'approve' && action !== 'skip')) {
    await answerCallbackQuery(callback.id, 'Unrecognized action');
    return new Response('OK');
  }

  const draft = await getDraftApplication(draftId);
  if (!draft) {
    await answerCallbackQuery(callback.id, 'Draft no longer available');
    return new Response('OK');
  }

  if (draft.status !== 'pending') {
    await answerCallbackQuery(callback.id, `Already ${draft.status}`);
    return new Response('OK');
  }

  const chatId = String(callback.message.chat.id);
  const messageId = callback.message.message_id;
  const originalText = callback.message.text ?? '';

  if (action === 'skip') {
    await updateDraftStatus(draftId, 'skipped');
    await editMessageAfterDecision(chatId, messageId, originalText, '❌ *Skipped*');
    await answerCallbackQuery(callback.id, 'Skipped');
    return new Response('OK');
  }

  // action === 'approve'
  if (draft.method === 'email') {
    const sent = await sendApplicationEmail(draft);
    if (sent) {
      await updateDraftStatus(draftId, 'sent');
      await editMessageAfterDecision(chatId, messageId, originalText, `✅ *Sent via email to ${draft.target}*`);
      await answerCallbackQuery(callback.id, 'Sent!');
    } else {
      await updateDraftStatus(draftId, 'failed');
      await editMessageAfterDecision(
        chatId,
        messageId,
        originalText,
        `⚠️ *Approved, but the email send failed* — apply manually to ${draft.target}`,
      );
      await answerCallbackQuery(callback.id, 'Send failed — see message');
    }
  } else {
    await updateDraftStatus(draftId, 'approved');
    await editMessageAfterDecision(chatId, messageId, originalText, '✅ *Approved* — submit the draft above at the link manually');
    await answerCallbackQuery(callback.id, 'Approved');
  }

  return new Response('OK');
};
