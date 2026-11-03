"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export default function AppError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const t = useTranslations("states");
  return (
    <div role="alert" className="mx-auto flex max-w-2xl flex-col items-center gap-3 py-10 text-center">
      <h1 className="text-xl font-semibold">{t("errorTitle")}</h1>
      <p className="text-sm text-muted-foreground">{t("errorBody")}</p>
      <Button onClick={() => retry()} className="h-11 px-4">
        {t("retry")}
      </Button>
    </div>
  );
}
