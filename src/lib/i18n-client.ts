"use client";

// Lets non-React modules (store actions, toasts) translate messages. The provider registers the
// root translator from next-intl on mount.

import { createFormat } from "./format";
import type { ISODate } from "./types";

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;
type RawTranslator = (key: string) => unknown;

let translator: Translator = (key) => key;
let rawTranslator: RawTranslator = () => [];
let currentLocale = "uz";

export function setTranslator(t: Translator, raw?: RawTranslator, locale?: string) {
  translator = t;
  if (raw) rawTranslator = raw;
  if (locale) currentLocale = locale;
}

export function tr(key: string, values?: Record<string, string | number | Date>): string {
  try {
    return translator(key, values);
  } catch {
    return key;
  }
}

/** The same date/number formatter the UI uses, for code outside React. */
export function formatter(today: ISODate, tz: string) {
  return createFormat(tr, (k) => {
    try {
      return rawTranslator(k);
    } catch {
      return [];
    }
  }, currentLocale, today, tz);
}
