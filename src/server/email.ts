import "server-only";
import { render } from "@react-email/render";
import type { ReactElement } from "react";
import { Resend } from "resend";
import { serverEnv } from "./env";

let client: Resend | null = null;

export function emailConfigured() {
  return Boolean(serverEnv.resendKey);
}

/** Send an email through Resend. Returns false (without throwing) when email is not configured. */
export async function sendEmail(input: { to: string; subject: string; react: ReactElement; attachments?: { filename: string; content: string }[] }): Promise<boolean> {
  if (!serverEnv.resendKey) return false;
  client ??= new Resend(serverEnv.resendKey);
  const html = await render(input.react);
  const text = await render(input.react, { plainText: true });
  const attachments = input.attachments?.map((a) => ({ filename: a.filename, content: Buffer.from(a.content, "utf8") }));
  const { error } = await client.emails.send({ from: serverEnv.emailFrom, to: input.to, subject: input.subject, html, text, ...(attachments?.length ? { attachments } : {}) });
  if (error) throw new Error(error.message);
  return true;
}
