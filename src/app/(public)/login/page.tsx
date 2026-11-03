import { getTranslations } from "next-intl/server";
import { buttonVariants } from "@/components/ui/button";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { cn } from "@/lib/utils";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const t = await getTranslations("login");
  const { error } = await searchParams;
  const configured = getSupabaseConfig() !== null;

  return (
    <>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-sm text-muted-foreground">{t("subtitle")}</p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}
        </p>
      )}
      {configured ? (
        // A plain link, not next/link: this leaves the app for Google and must not be prefetched.
        <a href="/auth/login" className={cn(buttonVariants(), "h-11 w-full text-base")}>
          {t("google")}
        </a>
      ) : (
        <p role="status" className="rounded-lg bg-surface-2 p-3 text-sm text-muted-foreground">
          {t("notConfigured")}
        </p>
      )}
    </>
  );
}
