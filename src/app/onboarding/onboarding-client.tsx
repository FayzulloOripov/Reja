"use client";

import { ArrowLeft, ArrowRight, BellRing, Check, Clock, Copy, FileUp, Globe2, Info, Layers, Link2, Loader2, Mail, Plus, Send, User, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { LogoMark } from "@/components/brand/logo";
import { DemoImportCard } from "@/components/settings/demo-import";
import { ImportPanel } from "@/components/settings/import";
import { PushCard } from "@/components/settings/personal";
import { IntegrationsSection } from "@/components/settings/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { useIsDemo } from "@/hooks/use-demo";
import { PROJECT_COLORS } from "@/lib/colors";
import { TELEGRAM_ENABLED } from "@/lib/env";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { timezoneLabel } from "@/lib/timezones";
import { setLocaleCookie } from "@/server/actions/locale";
import { createInvitation } from "@/server/actions/invitations";
import { createArea, createProject, createWorkspace, switchWorkspace, updateProfile } from "@/store/actions";
import { useAreas, useCurrentWorkspace, useMe, useToday, useTz, useWorkspaces } from "@/store/hooks";
import { flush, useStore } from "@/store/store";

const STEPS = [
  { key: "stepProfile", icon: User },
  { key: "stepDay", icon: Clock },
  { key: "stepAreas", icon: Layers },
  { key: "stepReminders", icon: Send },
  { key: "stepImport", icon: FileUp },
  { key: "stepInvite", icon: Users },
] as const;

const time5 = (v: string | null | undefined, fallback: string) => (v ?? fallback).slice(0, 5);

/**
 * First-run setup: name and time zone, working days and hours, areas and first projects, reminders
 * (Telegram, push), importing old data (planner JSON, CSV, demo data) and inviting a partner.
 * Every step can be skipped; the whole wizard can be reopened from Settings → Profile.
 */
export function OnboardingClient({ userId, demo }: { userId: string; demo?: boolean }) {
  useBootstrap(userId, demo);
  const t = useTranslations("onboarding");
  const tc = useTranslations();
  const router = useRouter();
  const me = useMe();
  const status = useStore((s) => s.status);
  const [step, setStep] = useState(0);

  async function finish() {
    if (!me?.onboarded_at) updateProfile({ onboarded_at: new Date().toISOString() });
    await flush();
    router.replace("/");
  }

  if (!me || status === "loading") {
    return (
      <main className="flex min-h-dvh items-center justify-center">
        <LogoMark className="size-10 animate-pulse" />
      </main>
    );
  }

  const last = step === STEPS.length - 1;
  const Icon = STEPS[step].icon;

  return (
    <main className="flex min-h-dvh flex-col items-center bg-[radial-gradient(ellipse_at_top,var(--brand-soft),transparent_60%)] px-4 py-8 sm:py-10">
      <div className="w-full max-w-xl">
        <div className="mb-6 flex items-center justify-between">
          <LogoMark className="size-9" />
          <Button variant="ghost" size="sm" onClick={finish}>
            {t("later")}
          </Button>
        </div>
        <ol className="mb-5 flex gap-1.5" aria-label={t("progress", { step: step + 1, total: STEPS.length })}>
          {STEPS.map((s, i) => (
            <li key={s.key} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-brand" : "bg-muted")} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">{t(s.key)}</span>
            </li>
          ))}
        </ol>
        <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="size-3.5" aria-hidden /> {t("progress", { step: step + 1, total: STEPS.length })} · {t(STEPS[step].key)}
        </p>

        <div key={step} className="animate-fade-up rounded-3xl border bg-card p-5 shadow-elev-3 sm:p-8">
          {step === 0 && <ProfileStep />}
          {step === 1 && <DayStep />}
          {step === 2 && <AreasStep />}
          {step === 3 && (
            <div className="space-y-4">
              <Heading icon={<BellRing className="size-5 text-brand" />} title={t("remindersTitle")} body={TELEGRAM_ENABLED ? t("remindersBody") : t("remindersBodyNoTelegram")} />
              {TELEGRAM_ENABLED && (
                <div className="[&>div>section]:shadow-none [&>div>section:nth-child(2)]:hidden">
                  <IntegrationsSection />
                </div>
              )}
              <div className="[&>section]:shadow-none">
                <PushCard />
              </div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-4">
              <Heading icon={<FileUp className="size-5 text-brand" />} title={t("importTitle")} body={t("importBody")} />
              <DemoImportCard />
              <ImportPanel />
            </div>
          )}
          {step === 5 && <InviteStep />}

          <div className="mt-8 flex items-center justify-between gap-2">
            <Button variant="ghost" className="px-2" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} aria-label={tc("common.back")}>
              <ArrowLeft /> <span className="hidden sm:inline">{tc("common.back")}</span>
            </Button>
            <div className="flex items-center gap-2">
              {!last && (
                <Button variant="ghost" onClick={() => setStep((s) => s + 1)}>
                  {t("skipStep")}
                </Button>
              )}
              {last ? (
                <Button onClick={finish}>
                  {t("finish")} <ArrowRight />
                </Button>
              ) : (
                <Button onClick={() => setStep((s) => s + 1)}>
                  {tc("common.continue")} <ArrowRight />
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

function Heading({ icon, title, body }: { icon?: React.ReactNode; title: string; body?: string }) {
  return (
    <div>
      <h1 className="flex items-center gap-2 text-22 font-bold">
        {icon}
        {title}
      </h1>
      {body && <p className="mt-1 text-muted-foreground">{body}</p>}
    </div>
  );
}

function ProfileStep() {
  const t = useTranslations("onboarding");
  const tc = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const me = useMe()!;
  const [name, setName] = useState(me.name);
  const [detectedTz] = useState(() => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Tashkent"));

  // a phone set to Samarkand time gets the matching zone (same offset, but the user's own city)
  useEffect(() => {
    if (!me.onboarded_at && detectedTz && me.timezone === "Asia/Tashkent" && detectedTz !== "Asia/Tashkent" && /^Asia\/(Samarkand|Tashkent)$/.test(detectedTz)) {
      updateProfile({ timezone: detectedTz });
    }
  }, [me.onboarded_at, me.timezone, detectedTz]);

  return (
    <div className="space-y-6">
      <Heading title={t("welcome")} body={t("welcomeBody")} />
      <label className="block space-y-2">
        <span className="text-sm font-medium">{tc("settings.name")}</span>
        <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== me.name && updateProfile({ name: name.trim() })} placeholder={t("namePlaceholder")} autoComplete="name" />
      </label>
      <div className="space-y-2">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Globe2 className="size-4" aria-hidden /> {tc("settings.language")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {(["uz", "en"] as const).map((l) => (
            <button
              key={l}
              onClick={async () => {
                updateProfile({ language: l });
                await setLocaleCookie(l);
                router.refresh();
              }}
              aria-pressed={locale === l}
              className={cn("flex h-12 items-center justify-between rounded-xl border px-4 text-sm font-medium", locale === l ? "border-brand bg-brand-soft" : "hover:bg-muted")}
            >
              {l === "uz" ? "Oʻzbekcha" : "English"} {locale === l && <Check className="size-4 text-brand" aria-hidden />}
            </button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{tc("settings.timezone")}</p>
        <Select value={me.timezone} onValueChange={(v) => updateProfile({ timezone: v })}>
          <SelectTrigger aria-label={tc("settings.timezone")} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Array.from(new Set(["Asia/Tashkent", "Asia/Samarkand", detectedTz, "Europe/Moscow", "Europe/Istanbul", "Asia/Dubai", "Europe/London", "UTC"])).map((z) => (
              <SelectItem key={z} value={z}>
                {timezoneLabel(z, locale)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function DayStep() {
  const t = useTranslations("onboarding");
  const tc = useTranslations();
  const me = useMe()!;
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  return (
    <div className="space-y-6">
      <Heading title={t("dayTitle")} body={t("dayBody")} />
      <div className="space-y-2">
        <p className="text-sm font-medium">{tc("settings.workDays")}</p>
        <div className="grid max-w-sm grid-cols-7 gap-1.5" role="group" aria-label={tc("settings.workDays")}>
          {f.weekdaysShort.map((d, i) => {
            const dow = i + 1;
            const on = me.work_days.includes(dow);
            return (
              <button
                key={d}
                aria-pressed={on}
                aria-label={f.weekdays[i]}
                onClick={() => updateProfile({ work_days: on ? me.work_days.filter((x) => x !== dow) : [...me.work_days, dow].sort() })}
                className={cn("aspect-square w-full max-w-11 rounded-full border text-xs font-semibold", on ? "border-brand bg-brand-soft text-brand-fg" : "text-muted-foreground")}
              >
                {d}
              </button>
            );
          })}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1.5">
          <span className="text-sm font-medium">{t("workStart")}</span>
          <Input type="time" className="tnum" value={time5(me.work_start, "10:00")} onChange={(e) => e.target.value && updateProfile({ work_start: e.target.value })} />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">{t("workEnd")}</span>
          <Input type="time" className="tnum" value={time5(me.work_end, "19:00")} onChange={(e) => e.target.value && updateProfile({ work_end: e.target.value })} />
        </label>
      </div>
      <p className="text-xs text-muted-foreground">{t("dayHint")}</p>
    </div>
  );
}

function AreasStep() {
  const t = useTranslations("onboarding");
  const tc = useTranslations();
  const ws = useCurrentWorkspace();
  const areas = useAreas(ws?.id);
  const projects = useStore((s) => s.data.projects);
  const chips = t.raw("areaChips") as string[];
  const [draft, setDraft] = useState("");
  const [projectDraft, setProjectDraft] = useState<Record<string, string>>({});

  const addArea = (name: string) => {
    const n = name.trim();
    if (!ws || !n || areas.some((a) => a.name.toLocaleLowerCase() === n.toLocaleLowerCase())) return;
    createArea({ workspaceId: ws.id, name: n, color: PROJECT_COLORS[(areas.length * 3) % PROJECT_COLORS.length] });
  };
  const addProject = (areaId: string, color: string) => {
    const n = (projectDraft[areaId] ?? "").trim();
    if (!ws || !n) return;
    createProject({ workspace_id: ws.id, name: n, color, area_id: areaId });
    setProjectDraft((d) => ({ ...d, [areaId]: "" }));
  };

  return (
    <div className="space-y-5">
      <Heading title={t("areasTitle")} body={t("areasBody")} />
      <div className="flex flex-wrap gap-2">
        {chips.map((c) => {
          const on = areas.some((a) => a.name === c);
          return (
            <button
              key={c}
              onClick={() => !on && addArea(c)}
              aria-pressed={on}
              className={cn("inline-flex h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors", on ? "border-brand bg-brand-soft text-brand-fg" : "hover:bg-muted")}
            >
              {on ? <Check className="size-3.5" aria-hidden /> : <Plus className="size-3.5" aria-hidden />} {c}
            </button>
          );
        })}
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          addArea(draft);
          setDraft("");
        }}
        className="flex gap-2"
      >
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("areaPlaceholder")} aria-label={t("areaPlaceholder")} />
        <Button type="submit" variant="outline" disabled={!draft.trim()} aria-label={tc("areas.new")}>
          <Plus />
        </Button>
      </form>
      {areas.length > 0 && (
        <ul className="space-y-2">
          {areas.map((a) => {
            const inArea = Object.values(projects).filter((p) => p.area_id === a.id && !p.deleted_at);
            return (
              <li key={a.id} data-color={a.color} className="rounded-xl border p-3">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <span className="size-2.5 rounded-full bg-pc" aria-hidden /> {a.name}
                </p>
                {inArea.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-1.5">
                    {inArea.map((p) => (
                      <li key={p.id} className="rounded-md bg-pc-soft px-2 py-0.5 text-xs text-pc-fg">
                        {p.name}
                      </li>
                    ))}
                  </ul>
                )}
                <form
                  className="mt-2 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    addProject(a.id, a.color);
                  }}
                >
                  <Input
                    value={projectDraft[a.id] ?? ""}
                    onChange={(e) => setProjectDraft((d) => ({ ...d, [a.id]: e.target.value }))}
                    placeholder={t("projectPlaceholder")}
                    aria-label={t("projectInArea", { area: a.name })}
                    className="h-9"
                  />
                  <Button type="submit" size="sm" variant="ghost" className="h-9" disabled={!(projectDraft[a.id] ?? "").trim()}>
                    {tc("common.add")}
                  </Button>
                </form>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function InviteStep() {
  const t = useTranslations("onboarding");
  const tc = useTranslations();
  const demo = useIsDemo();
  const workspaces = useWorkspaces();
  const shared = workspaces.find((w) => !w.is_personal);
  const [wsName, setWsName] = useState(tc("onboarding.sharedWorkspaceDefault"));
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);

  async function invite(withEmail: boolean) {
    if (demo) {
      toast.message(tc("app.demoBanner"));
      return;
    }
    setBusy(true);
    try {
      let wsId = shared?.id;
      if (!wsId) {
        const ws = createWorkspace(wsName.trim() || tc("onboarding.sharedWorkspaceDefault"));
        wsId = ws.id;
        await flush();
      } else switchWorkspace(wsId);
      const res = await createInvitation({ workspaceId: wsId, projectId: null, email: withEmail ? email.trim() : null, role: "member", expiresDays: 7 });
      if (!res.ok) {
        toast.error(res.error === "rate_limited" ? tc("auth.rateLimited") : tc("errors.saveFailed", { message: res.error }));
        return;
      }
      setLink(res.url);
      if (withEmail) {
        setEmail("");
        toast.success(res.emailed ? tc("settings.inviteSent") : tc("settings.inviteLinkCreated"));
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <Heading icon={<Users className="size-5 text-brand" />} title={t("inviteTitle")} body={t("inviteBody")} />
      {!shared && (
        <label className="block space-y-1.5">
          <span className="text-sm font-medium">{t("sharedWorkspace")}</span>
          <Input value={wsName} onChange={(e) => setWsName(e.target.value)} />
          <span className="block text-xs text-muted-foreground">{t("sharedWorkspaceHint")}</span>
        </label>
      )}
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          if (email.trim()) void invite(true);
        }}
      >
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tc("auth.emailPlaceholder")} aria-label={tc("common.email")} className="flex-1" />
        <Button type="submit" disabled={busy || !email.trim()}>
          {busy ? <Loader2 className="animate-spin" /> : <Mail />} {tc("settings.inviteSend")}
        </Button>
      </form>
      <Button variant="outline" onClick={() => invite(false)} disabled={busy}>
        <Link2 /> {tc("settings.inviteCreateLink")}
      </Button>
      {link && (
        <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
          <code className="flex-1 truncate text-xs">{link}</code>
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={tc("common.copy")}
            onClick={() => {
              void navigator.clipboard.writeText(link);
              toast.success(tc("common.copied"));
            }}
          >
            <Copy />
          </Button>
        </div>
      )}
      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {t("inviteHint")}
      </p>
    </div>
  );
}
