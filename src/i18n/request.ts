import { getRequestConfig } from "next-intl/server";
import { cookies, headers } from "next/headers";
import { defaultLocale, isLocale, LOCALE_COOKIE, type Locale } from "./config";

export default getRequestConfig(async () => {
  const cookieLocale = (await cookies()).get(LOCALE_COOKIE)?.value;
  let locale: Locale = defaultLocale;
  if (isLocale(cookieLocale)) {
    locale = cookieLocale;
  } else {
    // first visit: Uzbek unless the browser clearly prefers English and not Uzbek
    const accept = (await headers()).get("accept-language") ?? "";
    if (/^en\b/i.test(accept) && !/\buz\b/i.test(accept)) locale = "en";
  }
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
    timeZone: "Asia/Tashkent",
  };
});
