"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Archive, ArchiveRestore, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { archiveCategoryAction, createCategoryAction, renameCategoryAction } from "../actions";
import type { FinCategory, TransactionKind } from "../types";
import { categoryLabel } from "./format";

type DialogState = { kind: TransactionKind; category: FinCategory | null } | null;

function CategoryDialog(props: { kind: TransactionKind; category: FinCategory | null; currentName: string; onClose: () => void }) {
  const t = useTranslations("finance");
  const { pending, error, run } = useScheduleAction();
  const [name, setName] = useState(props.currentName);
  const { category } = props;

  return (
    <FormDialog
      open
      onClose={props.onClose}
      title={category ? t("renameCategory") : t("newCategory")}
      pending={pending}
      error={error}
      onSubmit={() =>
        run(
          () => (category ? renameCategoryAction({ id: category.id, name }) : createCategoryAction({ kind: props.kind, name })),
          props.onClose
        )
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="category-name">{t("categoryName")}</Label>
        <Input id="category-name" required maxLength={40} className="h-11" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
    </FormDialog>
  );
}

export function CategoriesPage({ categories }: { categories: FinCategory[] }) {
  const t = useTranslations("finance");
  const names = useTranslations("financeCategories");
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<DialogState>(null);
  const label = (category: FinCategory) => categoryLabel(category, (key) => names(key));

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {(["expense", "income"] as const).map((kind) => {
        const rows = categories.filter((category) => category.kind === kind);
        return (
          <section key={kind} className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold">{t(kind)}</h2>
              <Button
                type="button"
                variant="outline"
                className="h-10 gap-1.5 px-3"
                aria-label={t("addCategoryTo", { kind: t(kind) })}
                onClick={() => setDialog({ kind, category: null })}
              >
                <Plus className="size-4" aria-hidden="true" />
                {t("addCategory")}
              </Button>
            </div>
            <ul className="flex flex-col divide-y">
              {rows.map((category) => (
                <li key={category.id} className="flex items-center gap-1 py-1.5">
                  <span className={`min-w-0 flex-1 text-sm break-words ${category.archived ? "text-muted-foreground" : ""}`}>
                    {label(category)}
                    {category.archived && ` · ${t("archived")}`}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10"
                    aria-label={t("renameNamed", { category: label(category) })}
                    onClick={() => setDialog({ kind, category })}
                  >
                    <Pencil className="size-4" aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    className="size-10"
                    disabled={pending}
                    aria-label={t(category.archived ? "restoreNamed" : "archiveNamed", { category: label(category) })}
                    onClick={() => run(() => archiveCategoryAction({ id: category.id, archived: !category.archived }))}
                  >
                    {category.archived ? <ArchiveRestore className="size-4" aria-hidden="true" /> : <Archive className="size-4" aria-hidden="true" />}
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="text-xs text-muted-foreground">{t("archiveHint")}</p>
      {dialog && (
        <CategoryDialog
          kind={dialog.kind}
          category={dialog.category}
          currentName={dialog.category ? label(dialog.category) : ""}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}
