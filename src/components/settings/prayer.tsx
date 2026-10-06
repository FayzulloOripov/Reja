"use client";

import { Moon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useFormat } from "@/lib/format";
import { prayerBlocks, UZ_CITIES } from "@/lib/prayer";
import type { Profile } from "@/lib/types";
import { updateProfile } from "@/store/actions";
import { useToday, useTz } from "@/store/hooks";
import { SettingsCard, SettingsRow } from "./common";

/** Prayer-aware planning: off by default; on, the five prayers show on the day timeline and reminders wait. */
export function PrayerCard({ me }: { me: Profile }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const city = UZ_CITIES.find((c) => c.name === me.prayer_city);
  const blocks = prayerBlocks(today, me);
  return (
    <SettingsCard title={<span className="flex items-center gap-2"><Moon className="size-4 text-success" /> {t("prayer.title")}</span>} description={t("prayer.hint")}>
      <SettingsRow label={t("prayer.enable")}>
        <Switch
          checked={me.prayer_enabled}
          onCheckedChange={(v) => {
            const fallback = UZ_CITIES[0];
            updateProfile(v && me.prayer_lat == null ? { prayer_enabled: true, prayer_city: fallback.name, prayer_lat: fallback.lat, prayer_lng: fallback.lng } : { prayer_enabled: v });
          }}
          aria-label={t("prayer.enable")}
        />
      </SettingsRow>
      {me.prayer_enabled && (
        <>
          <SettingsRow label={t("prayer.city")} htmlFor="prayer-city">
            <Select
              value={city?.name ?? ""}
              onValueChange={(name) => {
                const c = UZ_CITIES.find((x) => x.name === name)!;
                updateProfile({ prayer_city: c.name, prayer_lat: c.lat, prayer_lng: c.lng });
              }}
            >
              <SelectTrigger id="prayer-city" className="w-48"><SelectValue placeholder={t("prayer.pickCity")} /></SelectTrigger>
              <SelectContent>
                {UZ_CITIES.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow label={t("prayer.madhab")} htmlFor="prayer-madhab">
            <Select value={me.prayer_madhab} onValueChange={(v) => updateProfile({ prayer_madhab: v as Profile["prayer_madhab"] })}>
              <SelectTrigger id="prayer-madhab" className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="hanafi">{t("prayer.hanafi")}</SelectItem>
                <SelectItem value="shafi">{t("prayer.shafi")}</SelectItem>
              </SelectContent>
            </Select>
          </SettingsRow>
          <SettingsRow label={t("prayer.minutes")} description={t("prayer.minutesHint")} htmlFor="prayer-minutes">
            <Select value={String(me.prayer_minutes)} onValueChange={(v) => updateProfile({ prayer_minutes: Number(v) })}>
              <SelectTrigger id="prayer-minutes" className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[10, 15, 20, 30, 45].map((m) => <SelectItem key={m} value={String(m)}>{t("meetings.minutes", { count: m })}</SelectItem>)}
              </SelectContent>
            </Select>
          </SettingsRow>
          {blocks.length > 0 && (
            <div className="px-5 py-3.5">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">{t("prayer.today")}</p>
              <ul className="flex flex-wrap gap-2 text-13 tnum">
                {blocks.map((b) => (
                  <li key={b.key} className="rounded-lg bg-success-soft/60 px-2.5 py-1 text-success-fg">
                    {t(`prayer.names.${b.key}`)} {f.time(b.start)}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-muted-foreground">{t("prayer.method")}</p>
            </div>
          )}
        </>
      )}
    </SettingsCard>
  );
}
