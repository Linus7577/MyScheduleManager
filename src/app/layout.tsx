import type { Metadata, Viewport } from "next";
import { Cinzel, Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { ChineseFonts } from "@/components/shell/chinese-fonts";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const cinzel = Cinzel({ subsets: ["latin"], variable: "--font-cinzel", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("app");
  return {
    title: t("name"),
    description: t("description"),
    appleWebApp: { capable: true, title: t("name"), statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = {
  themeColor: "#0a0a0c",
  viewportFit: "cover",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locale = await getLocale();

  return (
    <html lang={locale} className={`dark ${inter.variable} ${cinzel.variable} antialiased`}>
      <body className="min-h-dvh">
        {locale === "zh-TW" && <ChineseFonts />}
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
