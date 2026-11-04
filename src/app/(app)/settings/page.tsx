import Link from "next/link";
import { ChevronRight, ScrollText } from "lucide-react";
import { getLocale, getTranslations } from "next-intl/server";
import { getScheduleContext } from "@/features/schedule/context";
import { Card, CardContent } from "@/components/ui/card";
import { isLocale, DEFAULT_LOCALE } from "@/config/app.config";
import { CATEGORIES, CATEGORY_KEYS } from "@/config/game.config";
import { getMotionLevel, getOwnerTimezone } from "@/features/settings/queries";
import { SettingsForm } from "@/features/settings/settings-form";
import { SignOutForm } from "@/features/settings/sign-out-form";
import { BackupPanel } from "@/features/backup/components/backup-panel";
import { NotificationSettings } from "@/features/notifications/components/notification-settings";
import { isPushConfigured } from "@/features/notifications/push";
import { requireOwner } from "@/lib/auth/owner";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const categories = await getTranslations("categories");
  const owner = await requireOwner();
  const savedLocale = await getLocale();
  const timezone = await getOwnerTimezone();
  const motion = await getMotionLevel();
  const ctx = await getScheduleContext();
  const [aboutMe, notifications] = await Promise.all([ctx.repo.getAboutMe(), ctx.repo.getNotificationSettings()]);

  const zones = Intl.supportedValuesOf("timeZone");
  const timezones = zones.includes(timezone) ? zones : [timezone, ...zones];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <Card>
        <CardContent>
          <SettingsForm
            locale={isLocale(savedLocale) ? savedLocale : DEFAULT_LOCALE}
            timezone={timezone}
            timezones={timezones}
            motion={motion}
            aboutMe={aboutMe}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3">
          <h2 className="text-base font-semibold">{t("categoriesTitle")}</h2>
          <p className="text-xs text-muted-foreground">{t("categoriesHint")}</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th scope="col" className="py-1 font-normal">
                  {t("categoryColumn")}
                </th>
                <th scope="col" className="py-1 text-right font-normal">
                  {t("weightColumn")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {CATEGORY_KEYS.map((key) => {
                const { weight, dailyMinutesCap } = CATEGORIES[key] as { weight: number; dailyMinutesCap?: number };
                return (
                  <tr key={key}>
                    <td className="py-2">
                      {categories(key)}
                      {dailyMinutesCap && (
                        <span className="block text-xs text-muted-foreground">{t("categoryCap", { minutes: dailyMinutesCap })}</span>
                      )}
                    </td>
                    <td className="py-2 text-right tabular-nums">{weight}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <NotificationSettings
            settings={notifications}
            publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? null}
            serverReady={isPushConfigured()}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <BackupPanel />
        </CardContent>
      </Card>

      <Link
        href="/settings/logs"
        className="glow-card flex h-14 items-center gap-3 rounded-xl bg-card px-4 text-sm ring-1 ring-foreground/10"
      >
        <ScrollText className="size-5 text-crimson-400" aria-hidden="true" />
        {t("logs")}
        <ChevronRight className="ml-auto size-4 text-muted-foreground" aria-hidden="true" />
      </Link>

      {!owner.preview && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <h2 className="text-base font-semibold">{t("account")}</h2>
            <p className="text-sm break-all text-muted-foreground">{owner.email}</p>
            <SignOutForm />
          </CardContent>
        </Card>
      )}
      <p className="px-1 text-xs text-muted-foreground">{t("voiceCredit")}</p>
    </div>
  );
}
