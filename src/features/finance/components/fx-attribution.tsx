import { useTranslations } from "next-intl";
import { MARKET_SOURCES } from "@/config/finance.config";

/** The free exchange-rate source asks for this link on any page that shows its rates. */
export function FxAttribution() {
  const t = useTranslations("finance");
  return (
    <p className="text-xs text-muted-foreground">
      <a href={MARKET_SOURCES.fxAttribution} target="_blank" rel="noreferrer" className="underline underline-offset-4">
        {t("fxAttribution")}
      </a>
    </p>
  );
}
