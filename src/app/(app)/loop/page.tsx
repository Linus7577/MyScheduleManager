import { Repeat } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SealedPage } from "@/components/shell/sealed-page";

export default async function LoopPage() {
  const t = await getTranslations("loop");
  return <SealedPage title={t("title")} flavor={t("flavor")} phase={1} icon={Repeat} />;
}
