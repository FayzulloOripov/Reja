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
export async function sendEmail(input: { to: string; subject: string; react: ReactElement }): Promise<boolean> {
  if (!serverEnv.resendKey) return false;
  client ??= new Resend(serverEnv.resendKey);
  const html = await render(input.react);
  const text = await render(input.react, { plainText: true });
  const { error } = await client.emails.send({ from: serverEnv.emailFrom, to: input.to, subject: input.subject, html, text });
  if (error) throw new Error(error.message);
  return true;
}
