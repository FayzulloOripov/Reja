import "server-only";
import { createTranslator } from "next-intl";
import en from "../../messages/en.json";
import uz from "../../messages/uz.json";

const messages = { uz, en } as const;
export type ServerLocale = keyof typeof messages;

/** Translator for code that runs outside a request (scheduler, bot, emails). */
export function serverT(locale: string | null | undefined) {
  const l: ServerLocale = locale === "en" ? "en" : "uz";
  return createTranslator({ locale: l, messages: messages[l] as unknown as typeof uz });
}

export function monthNames(locale: string | null | undefined): string[] {
  return (locale === "en" ? en : uz).dates.months;
}

export function weekdayNames(locale: string | null | undefined): string[] {
  return (locale === "en" ? en : uz).dates.weekdays;
}
