"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CATEGORY_KEYS, type Category } from "@/config/game.config";
import type { BlockFields as BlockValues } from "../types";
import { FIELD_CLASS } from "./meta";

export const EMPTY_BLOCK: BlockValues = {
  start_time: "09:00",
  end_time: "10:00",
  category: "study",
  title: "",
  notes: "",
};

export function CategorySelect(props: {
  id: string;
  value: Category;
  onChange: (category: Category) => void;
}) {
  const t = useTranslations("categories");
  return (
    <select
      id={props.id}
      className={FIELD_CLASS}
      value={props.value}
      onChange={(event) => props.onChange(event.target.value as Category)}
    >
      {CATEGORY_KEYS.map((key) => (
        <option key={key} value={key}>
          {t(key)}
        </option>
      ))}
    </select>
  );
}

export type TrackOption = { id: string; title: string };

export function BlockFields(props: { value: BlockValues; onChange: (value: BlockValues) => void; tracks: TrackOption[] }) {
  const t = useTranslations("blockForm");
  const { value, onChange } = props;

  return (
    <>
      <div className="flex flex-col gap-2">
        <Label htmlFor="block-title">{t("title")}</Label>
        <Input
          id="block-title"
          required
          maxLength={120}
          className="h-11"
          value={value.title}
          onChange={(event) => onChange({ ...value, title: event.target.value })}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="block-start">{t("start")}</Label>
          <Input
            id="block-start"
            type="time"
            required
            className="h-11"
            value={value.start_time}
            onChange={(event) => onChange({ ...value, start_time: event.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="block-end">{t("end")}</Label>
          <Input
            id="block-end"
            type="time"
            required
            className="h-11"
            value={value.end_time}
            onChange={(event) => onChange({ ...value, end_time: event.target.value })}
          />
        </div>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">{t("midnightHint")}</p>
      <div className="flex flex-col gap-2">
        <Label htmlFor="block-category">{t("category")}</Label>
        <CategorySelect
          id="block-category"
          value={value.category}
          onChange={(category) => onChange({ ...value, category })}
        />
      </div>
      {props.tracks.length > 0 && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="block-track">{t("track")}</Label>
          <select
            id="block-track"
            className={FIELD_CLASS}
            value={value.track_id ?? ""}
            onChange={(event) => onChange({ ...value, track_id: event.target.value || null })}
          >
            <option value="">{t("noTrack")}</option>
            {props.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.title}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="block-notes">{t("notes")}</Label>
        <Textarea
          id="block-notes"
          maxLength={2000}
          rows={2}
          value={value.notes}
          onChange={(event) => onChange({ ...value, notes: event.target.value })}
        />
      </div>
    </>
  );
}
