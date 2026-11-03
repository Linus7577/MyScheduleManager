import "server-only";
import { cookies } from "next/headers";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE_SECONDS,
  MOTION_COOKIE,
  type Locale,
  type MotionLevel,
} from "@/config/app.config";

async function setPreferenceCookie(name: string, value: string) {
  const store = await cookies();
  store.set(name, value, {
    maxAge: LOCALE_COOKIE_MAX_AGE_SECONDS,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
}

export const setLocaleCookie = (locale: Locale) => setPreferenceCookie(LOCALE_COOKIE, locale);
export const setMotionCookie = (motion: MotionLevel) => setPreferenceCookie(MOTION_COOKIE, motion);
