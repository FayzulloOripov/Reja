import "server-only";
import { serverEnv } from "./env";

export interface InlineButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export function telegramConfigured() {
  return Boolean(serverEnv.telegramToken);
}

export class TelegramError extends Error {
  constructor(
    message: string,
    public code: number,
  ) {
    super(message);
  }
}

/** Minimal Bot API client for outgoing messages (the webhook side uses grammY). */
export async function tgCall<T = unknown>(method: string, body: Record<string, unknown>): Promise<T> {
  if (!serverEnv.telegramToken) throw new TelegramError("TELEGRAM_BOT_TOKEN is not set", 0);
  const res = await fetch(`https://api.telegram.org/bot${serverEnv.telegramToken}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string; error_code?: number };
  if (!json.ok) throw new TelegramError(json.description ?? "telegram error", json.error_code ?? res.status);
  return json.result as T;
}

export function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function sendTelegram(chatId: number | string, html: string, buttons?: InlineButton[][]) {
  return tgCall("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
    ...(buttons?.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
  });
}
