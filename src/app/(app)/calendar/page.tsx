import { CalendarDays } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SealedPage } from "@/components/shell/sealed-page";

export default async function CalendarPage() {
  const t = await getTranslations("calendar");
  return <SealedPage title={t("title")} flavor={t("flavor")} phase={1} icon={CalendarDays} />;
}
