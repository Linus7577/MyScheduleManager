"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Pencil, Pin, PinOff, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { deleteItemAction, setItemPinnedAction } from "../actions";
import type { VaultItem, VaultSection } from "../types";
import { ItemDialog, type LinkOptions } from "./item-dialog";

/** Pin, edit and delete on a single item's page. */
export function ItemActions(props: { item: VaultItem; sections: VaultSection[]; options: LinkOptions }) {
  const t = useTranslations("vault");
  const router = useRouter();
  const { pending, error, run } = useScheduleAction();
  const [editing, setEditing] = useState(false);
  const { item } = props;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          aria-pressed={item.pinned}
          className="h-10 gap-1.5 px-3"
          onClick={() => run(() => setItemPinnedAction({ id: item.id, pinned: !item.pinned }))}
        >
          {item.pinned ? <PinOff className="size-4" aria-hidden="true" /> : <Pin className="size-4" aria-hidden="true" />}
          {t(item.pinned ? "unpin" : "pin")}
        </Button>
        <Button type="button" variant="outline" className="h-10 gap-1.5 px-3" onClick={() => setEditing(true)}>
          <Pencil className="size-4" aria-hidden="true" />
          {t("edit")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          className="h-10 gap-1.5 px-3 text-destructive"
          onClick={() => {
            if (window.confirm(t("deleteConfirm", { title: item.title }))) {
              run(() => deleteItemAction({ id: item.id }), () => router.push("/vault"));
            }
          }}
        >
          <Trash2 className="size-4" aria-hidden="true" />
          {t("delete")}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editing && <ItemDialog item={item} sections={props.sections} options={props.options} onClose={() => setEditing(false)} />}
    </div>
  );
}
