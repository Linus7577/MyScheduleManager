import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { DEFAULT_LOCALE, DEFAULT_TIMEZONE, LOCALE_COOKIE, isLocale } from "@/config/app.config";

export default getRequestConfig(async () => {
  const store = await cookies();
  const saved = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : DEFAULT_LOCALE;

  return {
    locale,
    timeZone: DEFAULT_TIMEZONE,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
