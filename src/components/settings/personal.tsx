"use client";

import { BellRing, Loader2, Smartphone, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common/bits";
import { useTheme } from "@/components/providers/theme";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TELEGRAM_ENABLED, VAPID_PUBLIC_KEY } from "@/lib/env";
import { isDemo } from "@/hooks/use-demo";
import { useFormat } from "@/lib/format";
import type { Channel, NotificationType, Profile } from "@/lib/types";
import { cn } from "@/lib/utils";
import { updateProfile } from "@/store/actions";
import { useMe, useToday, useTz, useUserId } from "@/store/hooks";
import { setLocaleCookie } from "@/server/actions/locale";
import { sendTestNotification } from "@/server/actions/notifications";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { PrayerCard } from "./prayer";
import { DevicesCard } from "./trust";
import { SettingsCard, SettingsRow, timeValue } from "./common";
import { useSyncedState } from "@/hooks/use-synced-state";

export function ProfileSection() {
  const t = useTranslations();
  const me = useMe();
  const locale = useLocale();
  const router = useRouter();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const { theme, setTheme } = useTheme();
  const [name, setName] = useSyncedState(me?.name ?? "");
  const [avatar, setAvatar] = useSyncedState(me?.avatar_url ?? "");
  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return ["Asia/Tashkent", "Asia/Samarkand", "Europe/Moscow", "Europe/Istanbul", "Asia/Dubai", "UTC"];
    }
  }, []);
  if (!me) return null;

  return (
    <div className="space-y-5">
    <SettingsCard title={t("settings.profile")}>
      <div className="flex items-center gap-4 px-5 py-4">
        <UserAvatar profile={{ ...me, avatar_url: avatar || null }} size={56} />
        <div className="grid flex-1 gap-2 sm:grid-cols-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== me.name && updateProfile({ name: name.trim() })} aria-label={t("settings.name")} placeholder={t("settings.name")} />
          <Input value={avatar} onChange={(e) => setAvatar(e.target.value)} onBlur={() => avatar !== (me.avatar_url ?? "") && updateProfile({ avatar_url: /^https:\/\//.test(avatar) ? avatar : null })} aria-label={t("settings.avatar")} placeholder="https://…" />
        </div>
      </div>
      <SettingsRow label={t("settings.language")}>
        <Select
          value={locale}
          onValueChange={async (v) => {
            updateProfile({ language: v as Profile["language"] });
            await setLocaleCookie(v);
            router.refresh();
          }}
        >
          <SelectTrigger aria-label={t("settings.language")} className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="uz">Oʻzbekcha</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow label={t("settings.timezone")}>
        <Select value={me.timezone} onValueChange={(v) => updateProfile({ timezone: v })}>
          <SelectTrigger aria-label={t("settings.timezone")} className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent className="max-h-80">
            {zones.map((z) => <SelectItem key={z} value={z}>{z}</SelectItem>)}
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow label={t("settings.theme")}>
        <Select value={theme} onValueChange={(v) => { setTheme(v as "light"); updateProfile({ theme: v as Profile["theme"] }); }}>
          <SelectTrigger aria-label={t("settings.theme")} className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="system">{t("nav.themeSystem")}</SelectItem>
            <SelectItem value="light">{t("nav.themeLight")}</SelectItem>
            <SelectItem value="dark">{t("nav.themeDark")}</SelectItem>
          </SelectContent>
        </Select>
      </SettingsRow>
      <SettingsRow label={t("settings.workDays")}>
        <div className="flex gap-1" role="group" aria-label={t("settings.workDays")}>
          {f.weekdaysShort.map((d, i) => {
            const dow = i + 1;
            const on = me.work_days.includes(dow);
            return (
              <button
                key={d}
                aria-pressed={on}
                onClick={() => updateProfile({ work_days: on ? me.work_days.filter((x) => x !== dow) : [...me.work_days, dow].sort() })}
                className={cn("size-9 rounded-full border text-xs font-semibold", on ? "border-brand bg-brand-soft text-brand-fg" : "text-muted-foreground")}
              >
                {d}
              </button>
            );
          })}
        </div>
      </SettingsRow>
      <SettingsRow label={t("settings.workHours")} description={t("settings.workHoursHint")}>
        <TimeRange start={me.work_start} end={me.work_end} fallback={["10:00", "19:00"]} onChange={(work_start, work_end) => updateProfile({ work_start, work_end })} label={t("settings.workHours")} />
      </SettingsRow>
      <SettingsRow label={t("settings.dayHours")} description={t("settings.dayHoursHint")}>
        <TimeRange start={me.day_start} end={me.day_end} fallback={["07:00", "22:00"]} onChange={(day_start, day_end) => updateProfile({ day_start, day_end })} label={t("settings.dayHours")} />
      </SettingsRow>
      <SettingsRow label={t("settings.capacity")} description={t("settings.capacityHint")}>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Input
            type="number"
            min={1}
            max={100}
            className="w-20 tnum"
            defaultValue={me.daily_capacity_tasks ?? ""}
            key={`ct-${me.daily_capacity_tasks}`}
            onBlur={(e) => updateProfile({ daily_capacity_tasks: e.target.value ? Math.max(1, Math.min(100, Number(e.target.value))) : null })}
            aria-label={t("settings.capacityTasks")}
          />
          {t("settings.capacityTasksUnit")}
        </label>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Input
            type="number"
            min={0.5}
            max={24}
            step={0.5}
            className="w-20 tnum"
            defaultValue={me.daily_capacity_minutes ? me.daily_capacity_minutes / 60 : ""}
            key={`cm-${me.daily_capacity_minutes}`}
            onBlur={(e) => updateProfile({ daily_capacity_minutes: e.target.value ? Math.round(Math.max(0.25, Math.min(24, Number(e.target.value))) * 60) : null })}
            aria-label={t("settings.capacityHours")}
          />
          {t("settings.capacityHoursUnit")}
        </label>
      </SettingsRow>
      <SettingsRow label={t("onboarding.reopen")}>
        <Button variant="outline" size="sm" onClick={() => router.push("/onboarding")}>
          {t("onboarding.reopen")}
        </Button>
      </SettingsRow>
    </SettingsCard>
    <PrayerCard me={me} />
    <DevicesCard />
    </div>
  );
}

function TimeRange({ start, end, fallback, onChange, label }: { start: string | null; end: string | null; fallback: [string, string]; onChange: (start: string, end: string) => void; label: string }) {
  const t = useTranslations("settings");
  const s = timeValue(start) || fallback[0];
  const e = timeValue(end) || fallback[1];
  return (
    <>
      <Input type="time" className="w-28 tnum" value={s} onChange={(ev) => ev.target.value && onChange(ev.target.value, e)} aria-label={`${label}: ${t("from")}`} />
      <span className="text-xs text-muted-foreground">–</span>
      <Input type="time" className="w-28 tnum" value={e} onChange={(ev) => ev.target.value && onChange(s, ev.target.value)} aria-label={`${label}: ${t("to")}`} />
    </>
  );
}

const EVENTS: (NotificationType | "digest" | "review")[] = ["reminder", "assigned", "mentioned", "comment", "status_change", "due_soon", "overdue", "invite", "digest", "review"];
const CHANNELS: Channel[] = TELEGRAM_ENABLED ? ["in_app", "telegram", "push", "email"] : ["in_app", "push", "email"];

export function NotificationsSection() {
  const t = useTranslations();
  const me = useMe();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  if (!me) return null;
  const prefs = me.notify_prefs;
  const setPref = (ch: Channel, ev: string, on: boolean) => updateProfile({ notify_prefs: { ...prefs, [ch]: { ...(prefs[ch] ?? {}), [ev]: on } } });
  // full phrases ("Kimdir sizga vazifa berdi"), not notification fragments
  const label = (ev: string) => t(`settings.events.${ev}` as never);
  const channelLabel = (c: Channel) => t(`settings.channel${c === "in_app" ? "InApp" : c[0].toUpperCase() + c.slice(1)}` as never);

  return (
    <div className="space-y-5">
      <SettingsCard title={t("settings.notifications")}>
        <SettingsRow label={t("settings.quietHours")} description={t("settings.quietHoursHint")}>
          <Switch checked={me.quiet_enabled} onCheckedChange={(v) => updateProfile({ quiet_enabled: v })} aria-label={t("settings.quietHours")} />
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input type="time" className="w-28 tnum" value={timeValue(me.quiet_start) || "22:00"} disabled={!me.quiet_enabled} onChange={(e) => e.target.value && updateProfile({ quiet_start: e.target.value })} aria-label={t("settings.quietFrom")} />
            {t("settings.from")}
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Input type="time" className="w-28 tnum" value={timeValue(me.quiet_end) || "07:00"} disabled={!me.quiet_enabled} onChange={(e) => e.target.value && updateProfile({ quiet_end: e.target.value })} aria-label={t("settings.quietTo")} />
            {t("settings.to")}
          </label>
        </SettingsRow>
        <SettingsRow label={t("settings.digest")} description={t("settings.digestHint")}>
          <Switch checked={me.digest_enabled} onCheckedChange={(v) => updateProfile({ digest_enabled: v })} aria-label={t("settings.digest")} />
          <Input type="time" className="w-28 tnum" value={timeValue(me.digest_time)} disabled={!me.digest_enabled} onChange={(e) => e.target.value && updateProfile({ digest_time: e.target.value })} aria-label={t("settings.digest")} />
        </SettingsRow>
        <SettingsRow label={t("settings.weeklyReview")} description={t("settings.weeklyReviewHint")}>
          <Switch checked={me.review_enabled} onCheckedChange={(v) => updateProfile({ review_enabled: v })} aria-label={t("settings.weeklyReview")} />
          <Select value={String(me.review_dow)} onValueChange={(v) => updateProfile({ review_dow: Number(v) })} disabled={!me.review_enabled}>
            <SelectTrigger aria-label={t("settings.weeklyReview")} className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {f.weekdays.map((d, i) => <SelectItem key={d} value={String(i + 1)}>{d[0].toUpperCase() + d.slice(1)}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="time" className="w-28 tnum" value={timeValue(me.review_time)} disabled={!me.review_enabled} onChange={(e) => e.target.value && updateProfile({ review_time: e.target.value })} aria-label={t("settings.weeklyReview")} />
        </SettingsRow>
        <SettingsRow label={t("settings.shutdown")} description={t("settings.shutdownHint")}>
          <Switch checked={me.shutdown_enabled} onCheckedChange={(v) => updateProfile({ shutdown_enabled: v })} aria-label={t("settings.shutdown")} />
          <Input type="time" className="w-28 tnum" value={timeValue(me.shutdown_time)} disabled={!me.shutdown_enabled} onChange={(e) => e.target.value && updateProfile({ shutdown_time: e.target.value })} aria-label={t("settings.shutdownTime")} />
        </SettingsRow>
        <SettingsRow label={t("settings.overdueNudge")}>
          <Switch checked={me.overdue_nudge_enabled} onCheckedChange={(v) => updateProfile({ overdue_nudge_enabled: v })} aria-label={t("settings.overdueNudge")} />
        </SettingsRow>
        <SettingsRow label={t("settings.defaultReminder")} description={t("settings.defaultReminderHint")}>
          <Select value={me.default_reminder} onValueChange={(v) => updateProfile({ default_reminder: v as Profile["default_reminder"] })}>
            <SelectTrigger aria-label={t("settings.defaultReminder")} className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("settings.defaultReminderNone")}</SelectItem>
              <SelectItem value="at_due">{t("task.reminderAtDue")}</SelectItem>
              <SelectItem value="15m">{t("task.reminder15m")}</SelectItem>
              <SelectItem value="1h">{t("task.reminder1h")}</SelectItem>
              <SelectItem value="1d">{t("task.reminder1d")}</SelectItem>
            </SelectContent>
          </Select>
        </SettingsRow>
      </SettingsCard>

      <SettingsCard title={t("settings.channels")} description={t("settings.channelsHint")}>
        {/* desktop: event × channel table */}
        <div className="hidden px-5 py-3 md:block">
          <table className="w-full text-13">
            <thead>
              <tr className="text-xs text-muted-foreground">
                <th scope="col" className="py-2 text-left font-medium">{t("settings.eventType")}</th>
                {CHANNELS.map((c) => (
                  <th key={c} scope="col" className="px-2 py-2 text-center font-medium">{channelLabel(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {EVENTS.map((ev) => (
                <tr key={ev}>
                  <th scope="row" className="py-2 text-left font-normal">{label(ev)}</th>
                  {CHANNELS.map((c) => {
                    const na = c === "in_app" && (ev === "digest" || ev === "review");
                    return (
                      <td key={c} className="px-2 py-2 text-center">
                        {na ? (
                          <span className="text-muted-foreground" aria-label={t("settings.notAvailable")}>—</span>
                        ) : (
                          <Checkbox checked={Boolean(prefs[c]?.[ev])} onCheckedChange={(v) => setPref(c, ev, Boolean(v))} aria-label={`${label(ev)}: ${channelLabel(c)}`} />
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* phones: one card per event with labelled switches */}
        <ul className="divide-y md:hidden">
          {EVENTS.map((ev) => (
            <li key={ev} className="px-4 py-3">
              <p className="mb-2 text-sm font-medium">{label(ev)}</p>
              <div className="grid grid-cols-2 gap-2">
                {CHANNELS.filter((c) => !(c === "in_app" && (ev === "digest" || ev === "review"))).map((c) => (
                  <label key={c} className="flex min-h-11 items-center justify-between gap-2 rounded-xl border px-3 text-13">
                    {channelLabel(c)}
                    <Switch checked={Boolean(prefs[c]?.[ev])} onCheckedChange={(v) => setPref(c, ev, v)} aria-label={`${label(ev)}: ${channelLabel(c)}`} />
                  </label>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </SettingsCard>

      <PushCard />
    </div>
  );
}

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function deviceLabel() {
  const ua = navigator.userAgent;
  const os = /iphone|ipad/i.test(ua) ? "iOS" : /android/i.test(ua) ? "Android" : /mac/i.test(ua) ? "macOS" : /windows/i.test(ua) ? "Windows" : "Linux";
  const browser = /edg\//i.test(ua) ? "Edge" : /chrome|crios/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "Browser";
  return `${browser} · ${os}`;
}

interface PushRow {
  id: string;
  endpoint: string;
  device_label: string | null;
  created_at: string;
}

export function PushCard() {
  const t = useTranslations();
  const uid = useUserId();
  // rendered only on the client (app pages mount after hydration), so browser APIs are safe here
  const [supported] = useState(() => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window);
  const [permission, setPermission] = useState<NotificationPermission>(() => (typeof Notification !== "undefined" ? Notification.permission : "default"));
  const [current, setCurrent] = useState<string | null>(null);
  const [devices, setDevices] = useState<PushRow[]>([]);
  const [busy, setBusy] = useState(false);
  // only explain a refusal after the user has tried on this page
  const [tried, setTried] = useState(false);
  const ios = typeof navigator !== "undefined" && /iphone|ipad/i.test(navigator.userAgent);

  const loadDevices = useCallback(async () => {
    if (isDemo()) return;
    const { data } = await getBrowserSupabase().from("push_subscriptions").select("id, endpoint, device_label, created_at").eq("user_id", uid);
    setDevices((data as PushRow[]) ?? []);
  }, [uid]);

  useEffect(() => {
    if (!supported) return;
    void navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setCurrent(s?.endpoint ?? null));
    if (!isDemo()) {
      void getBrowserSupabase()
        .from("push_subscriptions")
        .select("id, endpoint, device_label, created_at")
        .eq("user_id", uid)
        .then(({ data }) => setDevices((data as PushRow[]) ?? []));
    }
  }, [supported, uid]);

  async function enable() {
    setBusy(true);
    setTried(true);
    try {
      const perm = await Notification.requestPermission();
      setPermission(perm);
      if (perm !== "granted") return;
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      if (!VAPID_PUBLIC_KEY) {
        toast.error(t("settings.pushNotReady"));
        return;
      }
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      if (!isDemo()) {
        const { error } = await getBrowserSupabase()
          .from("push_subscriptions")
          .upsert(
            { user_id: uid, endpoint: json.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth, device_label: deviceLabel(), user_agent: navigator.userAgent.slice(0, 300) },
            { onConflict: "endpoint" },
          );
        if (error) throw new Error(error.message);
      }
      setCurrent(json.endpoint);
      toast.success(t("settings.pushEnabled"));
      setTimeout(loadDevices, 1500);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    const reg = await navigator.serviceWorker.getRegistration();
    const sub = await reg?.pushManager.getSubscription();
    const row = devices.find((d) => d.endpoint === sub?.endpoint);
    await sub?.unsubscribe();
    if (row) await getBrowserSupabase().from("push_subscriptions").delete().eq("id", row.id);
    setCurrent(null);
    void loadDevices();
  }

  async function test() {
    const res = await sendTestNotification("push");
    if (res.ok) toast.success(t("common.done"));
    else toast.error(res.error ?? t("common.error"));
  }

  return (
    <SettingsCard title={t("settings.pushTitle")} description={ios ? t("settings.pushIos") : undefined}>
      <SettingsRow
        label={t("settings.pushThisDevice")}
        description={
          !supported ? t("settings.pushUnsupported") : current ? t("settings.pushEnabled") : tried && permission === "denied" ? t("settings.pushDenied") : t("settings.pushOff")
        }
      >
        {current ? (
          <>
            <Button variant="outline" size="sm" onClick={test}><BellRing /> {t("settings.pushTest")}</Button>
            <Button variant="ghost" size="sm" onClick={disable}>{t("settings.pushDisable")}</Button>
          </>
        ) : (
          <Button size="sm" onClick={enable} disabled={!supported || busy || (tried && permission === "denied")}>
            {busy ? <Loader2 className="animate-spin" /> : <BellRing />} {t("settings.pushEnable")}
          </Button>
        )}
      </SettingsRow>
      {devices.length > 0 && (
        <div className="px-5 py-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("settings.pushDevices")}</p>
          <ul className="space-y-1">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center gap-2 text-13">
                <Smartphone className="size-4 text-muted-foreground" />
                <span className="flex-1">{d.device_label ?? "—"}</span>
                {d.endpoint === current && <span className="text-xs text-success-fg">●</span>}
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t("common.delete")}
                  onClick={async () => {
                    await getBrowserSupabase().from("push_subscriptions").delete().eq("id", d.id);
                    void loadDevices();
                  }}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsCard>
  );
}
