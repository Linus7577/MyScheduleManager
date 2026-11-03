import { Eye } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { SealedPage } from "@/components/shell/sealed-page";

export default async function OraclePage() {
  const t = await getTranslations("oracle");
  return <SealedPage title={t("title")} flavor={t("flavor")} phase={4} icon={Eye} />;
}
