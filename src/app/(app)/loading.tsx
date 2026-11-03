import { useTranslations } from "next-intl";

export default function Loading() {
  const t = useTranslations("states");
  return (
    <p role="status" className="mx-auto max-w-2xl py-10 text-center text-sm text-muted-foreground">
      {t("loading")}
    </p>
  );
}
