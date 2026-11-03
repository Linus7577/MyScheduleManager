"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/config/app.config";
import { saveSettings } from "./actions";
import type { SaveSettingsState } from "./schema";

const fieldClass =
  "h-11 w-full rounded-lg border border-input bg-surface-2 px-3 text-sm text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";

export function SettingsForm(props: { locale: Locale; timezone: string; timezones: string[] }) {
  const t = useTranslations("settings");
  const [state, action, pending] = useActionState<SaveSettingsState, FormData>(saveSettings, { status: "idle" });

  return (
    <form action={action} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <label htmlFor="locale" className="text-sm font-medium">
          {t("language")}
        </label>
        <select id="locale" name="locale" defaultValue={props.locale} className={fieldClass}>
          <option value="en">{t("languageEn")}</option>
          <option value="zh-TW">{t("languageZhTw")}</option>
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="timezone" className="text-sm font-medium">
          {t("timezone")}
        </label>
        <select id="timezone" name="timezone" defaultValue={props.timezone} className={fieldClass}>
          {props.timezones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{t("timezoneHelp")}</p>
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="h-11 min-w-24 px-4">
          {pending ? t("saving") : t("save")}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {state.status === "saved" && t("saved")}
          {state.status === "savedPreview" && t("savedPreview")}
          {state.status === "invalid" && t("invalid")}
          {state.status === "failed" && t("saveFailed")}
        </p>
      </div>
    </form>
  );
}
