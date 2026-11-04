"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { countRows, MAX_UPLOAD_BYTES, readBackup } from "../logic";

const LINK_CLASS =
  "inline-flex h-11 items-center gap-1.5 rounded-lg px-3 text-sm ring-1 ring-foreground/15 hover:bg-surface-2";

type Chosen = { file: File; rows: number; exportedAt: string };

/** The free host takes 4.5 MB in one request. Backups are mostly repeated words, so they shrink to about a tenth. */
async function compressed(file: File): Promise<ArrayBuffer> {
  const stream = file.stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export function BackupPanel() {
  const t = useTranslations("backup");
  const errors = useTranslations("errors");
  const format = useFormatter();
  const router = useRouter();
  const [backedUp, setBackedUp] = useState(false);
  const [chosen, setChosen] = useState<Chosen | null>(null);
  const [word, setWord] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  async function choose(file: File) {
    setError(null);
    setChosen(null);
    setWord("");
    try {
      const backup = readBackup(JSON.parse(await file.text()));
      if (!backup) throw new Error("Not a backup");
      setChosen({ file, rows: countRows(backup), exportedAt: backup.exported_at });
    } catch {
      setError(errors("badBackupFile"));
    }
  }

  async function restore() {
    if (!chosen) return;
    setError(null);
    setRestoring(true);
    try {
      const body = await compressed(chosen.file);
      if (body.byteLength > MAX_UPLOAD_BYTES) throw new RangeError("Too large");
      const response = await fetch("/api/backup/restore", {
        method: "POST",
        headers: { "Content-Type": "application/gzip", "X-Restore-Confirm": "replace-everything" },
        body,
      });
      const result = (await response.json()) as { ok: true } | { ok: false; code: "badBackupFile" | "restoreFailed" | "failed" };
      if (result.ok) {
        // Every page already opened holds old data, so the app reads everything again.
        router.push("/");
        router.refresh();
        return;
      }
      setError(errors(result.code));
    } catch (problem) {
      setError(errors(problem instanceof RangeError ? "fileTooLarge" : "failed"));
    }
    setRestoring(false);
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{t("title")}</h2>

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">{t("exportTitle")}</h3>
        <p className="text-xs text-muted-foreground">{t("exportHint")}</p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/backup/export" download className={LINK_CLASS} onClick={() => setBackedUp(true)}>
            <Download className="size-4" aria-hidden="true" />
            {t("exportAll")}
          </a>
          <a href="/api/backup/finance?kind=transactions" download className={LINK_CLASS}>
            <Download className="size-4" aria-hidden="true" />
            {t("exportTransactions")}
          </a>
          <a href="/api/backup/finance?kind=trades" download className={LINK_CLASS}>
            <Download className="size-4" aria-hidden="true" />
            {t("exportTrades")}
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-lg bg-surface-2 p-3">
        <h3 className="text-sm font-medium">{t("restoreTitle")}</h3>
        <p className="text-xs text-muted-foreground">{t("restoreWarning")}</p>

        {!backedUp ? (
          <p className="text-sm">{t("restoreFirstBackup")}</p>
        ) : (
          <label
            className={cn(
              "inline-flex h-11 w-fit cursor-pointer items-center gap-1.5 rounded-lg px-3 text-sm ring-1 ring-foreground/15 hover:bg-surface focus-within:ring-2 focus-within:ring-ring",
              restoring && "pointer-events-none opacity-50"
            )}
          >
            <Upload className="size-4" aria-hidden="true" />
            {t("restoreChoose")}
            <input
              type="file"
              accept=".json,application/json"
              className="sr-only"
              disabled={restoring}
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) void choose(file);
              }}
            />
          </label>
        )}

        {chosen && (
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              {t("restoreSummary", {
                rows: chosen.rows,
                date: format.dateTime(new Date(chosen.exportedAt), { dateStyle: "medium", timeStyle: "short" }),
              })}
            </p>
            <Label htmlFor="restore-word">{t("restoreType", { word: t("restoreWord") })}</Label>
            <Input
              id="restore-word"
              autoComplete="off"
              className="h-11 max-w-60"
              value={word}
              onChange={(event) => setWord(event.target.value)}
            />
            <Button
              type="button"
              variant="destructive"
              className="h-11 w-fit px-4"
              disabled={restoring || word.trim() !== t("restoreWord")}
              onClick={() => void restore()}
            >
              {restoring ? t("restoring") : t("restoreButton")}
            </Button>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
