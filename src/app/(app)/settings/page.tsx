import { getLocale, getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { isLocale, DEFAULT_LOCALE } from "@/config/app.config";
import { getMotionLevel, getOwnerTimezone } from "@/features/settings/queries";
import { SettingsForm } from "@/features/settings/settings-form";
import { requireOwner } from "@/lib/auth/owner";

export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const owner = await requireOwner();
  const savedLocale = await getLocale();
  const timezone = await getOwnerTimezone();
  const motion = await getMotionLevel();

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
          />
        </CardContent>
      </Card>

      {!owner.preview && (
        <Card>
          <CardContent className="flex flex-col items-start gap-3">
            <h2 className="text-base font-semibold">{t("account")}</h2>
            <p className="text-sm break-all text-muted-foreground">{owner.email}</p>
            <form action="/auth/signout" method="post">
              <Button type="submit" variant="outline" className="h-11 px-4">
                {t("signOut")}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
