"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { VAULT_NOTE_MAX_LENGTH } from "@/config/app.config";
import type { Goal, LearningTrack, Project } from "@/features/command/types";
import { FormDialog } from "@/features/schedule/components/form-dialog";
import { FIELD_CLASS } from "@/features/schedule/components/meta";
import { useScheduleAction } from "@/features/schedule/components/use-action";
import { createItemAction, updateItemAction } from "../actions";
import { normalizeUrl, parseTags } from "../logic";
import { VAULT_ITEM_TYPES, type VaultItem, type VaultItemType, type VaultSection } from "../types";
import { sectionLabel } from "./item-meta";

export type LinkOptions = { goals: Goal[]; projects: Project[]; tracks: LearningTrack[] };

function currentLink(item: VaultItem | null): string {
  if (item?.goal_id) return `goal:${item.goal_id}`;
  if (item?.project_id) return `project:${item.project_id}`;
  if (item?.track_id) return `track:${item.track_id}`;
  return "";
}

export function ItemDialog(props: { item: VaultItem | null; sections: VaultSection[]; options: LinkOptions; onClose: () => void }) {
  const t = useTranslations("vault");
  const names = useTranslations("vaultSections");
  const { pending, error, run } = useScheduleAction();
  const { item, options } = props;

  const [type, setType] = useState<VaultItemType>(item?.type ?? "link");
  const [title, setTitle] = useState(item?.title ?? "");
  const [sectionId, setSectionId] = useState(item?.section_id ?? props.sections[0]?.id ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [description, setDescription] = useState(item?.description ?? "");
  const [tags, setTags] = useState(item?.tags.join(", ") ?? "");
  const [link, setLink] = useState(currentLink(item));

  const isNote = type === "note";

  function save() {
    const [linkType, linkId] = link.split(":");
    const fields = {
      type,
      title,
      section_id: sectionId,
      description,
      tags: parseTags(tags),
      url: isNote ? null : normalizeUrl(url),
      body: isNote ? body : "",
      goal_id: linkType === "goal" ? linkId : null,
      project_id: linkType === "project" ? linkId : null,
      track_id: linkType === "track" ? linkId : null,
      pinned: item?.pinned ?? false,
    };
    run(() => (item ? updateItemAction({ id: item.id, ...fields }) : createItemAction(fields)), props.onClose);
  }

  return (
    <FormDialog open onClose={props.onClose} title={item ? t("editItem") : t("newItem")} pending={pending} error={error} onSubmit={save}>
      <div className="flex flex-col gap-2">
        <Label htmlFor="item-type">{t("type")}</Label>
        <select id="item-type" className={FIELD_CLASS} value={type} onChange={(e) => setType(e.target.value as VaultItemType)}>
          {VAULT_ITEM_TYPES.map((option) => (
            <option key={option} value={option}>
              {t(`types.${option}`)}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t(`typeHints.${type}`)}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="item-title">{t("itemTitle")}</Label>
        <Input id="item-title" required maxLength={200} className="h-11" value={title} onChange={(e) => setTitle(e.target.value)} />
      </div>
      {isNote ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="item-body">{t("noteText")}</Label>
          <textarea
            id="item-body"
            required
            rows={8}
            maxLength={VAULT_NOTE_MAX_LENGTH}
            className={`${FIELD_CLASS} h-auto py-2`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t("markdownHint")}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="item-url">{t("address")}</Label>
          <Input
            id="item-url"
            required
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            maxLength={2000}
            placeholder="https://"
            className="h-11"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
        </div>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor="item-section">{t("section")}</Label>
        <select id="item-section" className={FIELD_CLASS} value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
          {props.sections.map((section) => (
            <option key={section.id} value={section.id}>
              {sectionLabel(section, (key) => names(key))}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="item-tags">{t("tags")}</Label>
        <Input id="item-tags" className="h-11" value={tags} onChange={(e) => setTags(e.target.value)} />
        <p className="text-xs text-muted-foreground">{t("tagsHint")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="item-description">{t("description")}</Label>
        <Input id="item-description" maxLength={2000} className="h-11" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="item-link">{t("linkedTo")}</Label>
        <select id="item-link" className={FIELD_CLASS} value={link} onChange={(e) => setLink(e.target.value)}>
          <option value="">{t("linkedToNothing")}</option>
          {options.goals.length > 0 && (
            <optgroup label={t("linkGoals")}>
              {options.goals.map((goal) => (
                <option key={goal.id} value={`goal:${goal.id}`}>
                  {goal.title}
                </option>
              ))}
            </optgroup>
          )}
          {options.projects.length > 0 && (
            <optgroup label={t("linkProjects")}>
              {options.projects.map((project) => (
                <option key={project.id} value={`project:${project.id}`}>
                  {project.title}
                </option>
              ))}
            </optgroup>
          )}
          {options.tracks.length > 0 && (
            <optgroup label={t("linkTracks")}>
              {options.tracks.map((track) => (
                <option key={track.id} value={`track:${track.id}`}>
                  {track.title}
                </option>
              ))}
            </optgroup>
          )}
        </select>
      </div>
    </FormDialog>
  );
}
