"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { LOCALE_COOKIE } from "@/i18n/config";

const schema = z.enum(["uz", "en"]);

export async function setLocaleCookie(locale: string) {
  const parsed = schema.safeParse(locale);
  if (!parsed.success) return;
  (await cookies()).set(LOCALE_COOKIE, parsed.data, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}
