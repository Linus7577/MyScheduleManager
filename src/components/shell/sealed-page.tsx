import { Lock, type LucideIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent } from "@/components/ui/card";

/** The empty state for a section that a later phase will build. */
export async function SealedPage(props: { title: string; flavor: string; phase: number; icon: LucideIcon }) {
  const t = await getTranslations("sealed");
  const Icon = props.icon;

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{props.title}</h1>
      <Card className="glow-card">
        <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
          <Icon className="size-8 text-crimson-400" aria-hidden="true" />
          <p className="max-w-sm text-base">{props.flavor}</p>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            {t("note", { phase: props.phase })}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
