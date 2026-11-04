"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { BookOpen, ChevronRight, GraduationCap, Map as MapIcon, Pencil, Plus, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import {
  createTrackAction,
  createUnitAction,
  deleteTrackAction,
  deleteUnitAction,
  updateTrackAction,
  updateUnitAction,
} from "../actions";
import type { LearningTrack, LearningUnit, ProgressSnapshot, TrackKind } from "../types";
import { ProgressChart, StudyChart } from "./chart-loaders";
import { ProgressBar } from "./progress-bar";

const KIND_ICONS: Record<TrackKind, LucideIcon> = { course: GraduationCap, roadmap: MapIcon, book: BookOpen };

function TrackDialog({ track, onClose }: { track: LearningTrack | null; onClose: () => void }) {
  const t = useTranslations("learning");
  const { pending, error, run } = useScheduleAction();
  const [title, setTitle] = useState(track?.title ?? "");
  const [kind, setKind] = useState<TrackKind>(track?.kind ?? "course");

  return (
    <FormDialog
      open
      onClose={onClose}
      title={track ? t("editTrack") : t("newTrack")}
      pending={pending}
      error={error}
      onSubmit={() =>
        run(() => (track ? updateTrackAction({ id: track.id, kind, title }) : createTrackAction({ kind, title })), onClose)
      }
    >
      <div className="flex flex-col gap-2">
        <Label htmlFor="track-title">{t("trackTitle")}</Label>
        <Input id="track-title" required maxLength={120} className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="track-kind">{t("kind")}</Label>
        <select id="track-kind" className={FIELD_CLASS} value={kind} onChange={(e) => setKind(e.target.value as TrackKind)}>
          <option value="course">{t("kinds.course")}</option>
          <option value="roadmap">{t("kinds.roadmap")}</option>
          <option value="book">{t("kinds.book")}</option>
        </select>
      </div>
    </FormDialog>
  );
}

export function LearningList(props: {
  tracks: (LearningTrack & { percent: number; unitCount: number })[];
  studyWeeks: { weekStart: string; minutes: Record<string, number> }[];
}) {
  const t = useTranslations("learning");
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Button type="button" className="h-11 gap-1.5 px-3" onClick={() => setAdding(true)}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newTrack")}
        </Button>
      </div>

      {props.tracks.length === 0 ? (
        <p className="rounded-xl bg-card px-4 py-10 text-center text-base ring-1 ring-foreground/10">{t("empty")}</p>
      ) : (
        <>
          <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {props.tracks.map((track) => {
              const Icon = KIND_ICONS[track.kind];
              return (
                <li key={track.id}>
                  <Link href={`/learning/${track.id}`} className="glow-card flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
                    <span className="flex items-center gap-2">
                      <Icon className="size-5 shrink-0 text-crimson-400" aria-hidden="true" />
                      <span className="min-w-0 flex-1 text-base font-medium break-words">{track.title}</span>
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    </span>
                    <ProgressBar percent={track.percent} label={t("progressOf", { title: track.title })} />
                    <span className="text-xs text-muted-foreground">
                      {t(`kinds.${track.kind}`)} · {t("unitCount", { count: track.unitCount })}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>

          <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="text-lg font-semibold">{t("studyMinutes")}</h2>
            <p className="text-xs text-muted-foreground">{t("studyHint")}</p>
            <StudyChart weeks={props.studyWeeks} tracks={props.tracks} />
          </section>
        </>
      )}

      {adding && <TrackDialog track={null} onClose={() => setAdding(false)} />}
    </div>
  );
}

function UnitDialog(props: { trackId: string; unit: LearningUnit | null; onClose: () => void }) {
  const t = useTranslations("learning");
  const { pending, error, run } = useScheduleAction();
  const { unit } = props;
  const [title, setTitle] = useState(unit?.title ?? "");
  const [percent, setPercent] = useState(unit?.percent ?? 0);

  function save() {
    const fields = { track_id: props.trackId, title, percent };
    run(
      () => (unit ? updateUnitAction({ id: unit.id, position: unit.position, ...fields }) : createUnitAction(fields)),
      props.onClose
    );
  }

  return (
    <FormDialog open onClose={props.onClose} title={unit ? t("editUnit") : t("newUnit")} pending={pending} error={error} onSubmit={save}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="unit-title">{t("unitTitle")}</Label>
        <Input id="unit-title" required maxLength={120} className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="unit-percent">{t("percentComplete")}</Label>
        <Input id="unit-percent" type="number" required min={0} max={100} className="h-11" value={percent} onChange={(e) => setPercent(Number(e.target.value))} />
      </div>
    </FormDialog>
  );
}

export function TrackDetail(props: {
  track: LearningTrack;
  percent: number;
  units: LearningUnit[];
  history: ProgressSnapshot[];
}) {
  const t = useTranslations("learning");
  const router = useRouter();
  const { pending, error, run } = useScheduleAction();
  const [dialog, setDialog] = useState<{ type: "track" } | { type: "unit"; unit: LearningUnit | null } | null>(null);
  const { track } = props;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-2">
        <h1 className="min-w-0 flex-1 text-2xl font-semibold break-words">{track.title}</h1>
        <Button type="button" variant="outline" className="h-10 px-3" onClick={() => setDialog({ type: "track" })}>
          {t("edit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          className="h-10 px-3 text-destructive"
          onClick={() => {
            if (!window.confirm(t("deleteTrackConfirm", { title: track.title }))) return;
            run(() => deleteTrackAction({ id: track.id }), () => router.push("/learning"));
          }}
        >
          {t("delete")}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <ProgressBar percent={props.percent} label={t("progressOf", { title: track.title })} />
        {props.units.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("noUnits")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {props.units.map((unit) => (
              <li key={unit.id} className="flex items-center gap-2 py-2">
                <div className="min-w-0 flex-1">
                  <p className="text-sm break-words">{unit.title}</p>
                  <ProgressBar percent={unit.percent} label={t("progressOf", { title: unit.title })} className="mt-1" />
                </div>
                <Button type="button" variant="ghost" className="size-10" aria-label={t("editUnitNamed", { title: unit.title })} onClick={() => setDialog({ type: "unit", unit })}>
                  <Pencil className="size-4" aria-hidden="true" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  className="size-10 text-destructive"
                  aria-label={t("deleteUnitNamed", { title: unit.title })}
                  onClick={() => {
                    if (window.confirm(t("deleteUnitConfirm", { title: unit.title }))) run(() => deleteUnitAction({ id: unit.id }));
                  }}
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="outline" className="h-10 w-fit gap-1.5 px-3" onClick={() => setDialog({ type: "unit", unit: null })}>
          <Plus className="size-4" aria-hidden="true" />
          {t("newUnit")}
        </Button>
      </section>

      <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="text-lg font-semibold">{t("progressOverTime")}</h2>
        <ProgressChart data={props.history} label={track.title} />
      </section>

      {dialog?.type === "track" && <TrackDialog track={track} onClose={() => setDialog(null)} />}
      {dialog?.type === "unit" && <UnitDialog trackId={track.id} unit={dialog.unit} onClose={() => setDialog(null)} />}
    </div>
  );
}
