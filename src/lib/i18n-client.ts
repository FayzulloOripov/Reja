"use client";

// Lets non-React modules (store actions, toasts) translate messages. The provider registers the
// root translator from next-intl on mount.

type Translator = (key: string, values?: Record<string, string | number | Date>) => string;

let translator: Translator = (key) => key;

export function setTranslator(t: Translator) {
  translator = t;
}

export function tr(key: string, values?: Record<string, string | number | Date>): string {
  try {
    return translator(key, values);
  } catch {
    return key;
  }
}
