"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/** Catches failures in the signed-in shell itself, such as the status strip being unable to read the game state. */
export default function RootError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("states");
  return (
    <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-3 p-4 text-center">
      <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorBody")}</p>
      <Button onClick={() => retry()} className="h-11 px-4">
        {t("retry")}
      </Button>
    </main>
  );
}
