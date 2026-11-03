"use client";

import { useEffect } from "react";

// Not next/font: self-hosting these means about 240 font files on every build. From Google, the browser fetches only
// the glyphs a page uses, and only in Chinese. Until they arrive, or if they never do, the device's own font is used.
const CHINESE_FONTS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&family=Noto+Serif+TC:wght@500;700&display=swap";

/** Added after the page appears, so a slow connection to Google can never hold the page back. */
export function ChineseFonts() {
  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = CHINESE_FONTS_URL;
    document.head.append(link);
    return () => link.remove();
  }, []);

  return null;
}
