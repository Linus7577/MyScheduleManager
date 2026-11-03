import Link from "next/link";
import { ShieldX } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function AccessDeniedPage() {
  const t = await getTranslations("accessDenied");
  return (
    <>
      <ShieldX className="size-8 text-crimson-400" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("body")}</p>
      <Link href="/login" className={cn(buttonVariants({ variant: "outline" }), "h-11 px-4")}>
        {t("back")}
      </Link>
    </>
  );
}
