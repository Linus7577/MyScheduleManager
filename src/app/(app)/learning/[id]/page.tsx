import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ChevronLeft } from "lucide-react";
import { z } from "zod";
import { TrackDetail } from "@/features/command/components/learning";
import { getTrackDetail, recordProgressSnapshots } from "@/features/command/service";
import { getScheduleContext } from "@/features/schedule/context";
import { LinkedItems } from "@/features/vault/components/linked-items";
import { getItemsForTrack } from "@/features/vault/service";

export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();

  const t = await getTranslations("learning");
  const ctx = await getScheduleContext();
  await recordProgressSnapshots(ctx);
  const [detail, vaultItems] = await Promise.all([getTrackDetail(ctx, id), getItemsForTrack(ctx, id)]);
  if (!detail) notFound();

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <Link href="/learning" className="flex h-10 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t("title")}
      </Link>
      <TrackDetail {...detail} />
      <LinkedItems items={vaultItems} />
    </div>
  );
}
