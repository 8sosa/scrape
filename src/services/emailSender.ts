import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config';
import type { DraftApplicationRow } from '../types';

let cachedTransporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!config.gmail.user || !config.gmail.appPassword) {
    return null;
  }
  if (!cachedTransporter) {
    cachedTransporter = nodemailer.createTransport({
      service: 'gmail',
      auth: { user: config.gmail.user, pass: config.gmail.appPassword },
    });
  }
  return cachedTransporter;
}

/**
 * Sends an approved application's cover note to its target email address via
 * Gmail SMTP. Returns false (never throws) if GMAIL_USER/GMAIL_APP_PASSWORD
 * aren't configured or the send fails — the caller decides what that means
 * for the draft's status.
 */
export async function sendApplicationEmail(draft: DraftApplicationRow): Promise<boolean> {
  const transporter = getTransporter();
  if (!transporter) {
    console.warn(`[email] GMAIL_USER/GMAIL_APP_PASSWORD not configured — cannot send draft ${draft.id}`);
    return false;
  }

  try {
    await transporter.sendMail({
      from: config.gmail.user ?? undefined,
      to: draft.target,
      subject: `Application: ${draft.title}`,
      text: draft.cover_note,
    });
    console.log(`[email] Sent application email for draft ${draft.id} to ${draft.target}`);
    return true;
  } catch (error) {
    console.error(`[email] Failed to send application email for draft ${draft.id}: ${(error as Error).message}`);
    return false;
  }
}
