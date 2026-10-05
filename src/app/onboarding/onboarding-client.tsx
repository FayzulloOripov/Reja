"use client";

import { ArrowRight, BellRing, Check, Globe2, Plus, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LogoMark } from "@/components/brand/logo";
import { PushCard } from "@/components/settings/personal";
import { IntegrationsSection } from "@/components/settings/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROJECT_COLORS } from "@/lib/colors";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useBootstrap } from "@/hooks/use-bootstrap";
import { createProject, updateProfile } from "@/store/actions";
import { useCurrentWorkspace, useMe, useToday, useTz } from "@/store/hooks";
import { flush, useStore } from "@/store/store";
import { setLocaleCookie } from "@/server/actions/locale";

const STEPS = ["stepLanguage", "stepProjects", "stepTelegram", "stepPush"] as const;

export function OnboardingClient({ userId, demo }: { userId: string; demo?: boolean }) {
  useBootstrap(userId, demo);
  const t = useTranslations("onboarding");
  const tc = useTranslations();
  const router = useRouter();
  const locale = useLocale();
  const me = useMe();
  const ws = useCurrentWorkspace();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const [step, setStep] = useState(0);
  const [projects, setProjects] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const chips = t.raw("chips") as string[];
  const status = useStore((s) => s.status);
  const [detectedTz] = useState(() => (typeof Intl !== "undefined" ? Intl.DateTimeFormat().resolvedOptions().timeZone : "Asia/Tashkent"));

  useEffect(() => {
    if (me && !me.onboarded_at && detectedTz && me.timezone === "Asia/Tashkent" && detectedTz !== "Asia/Tashkent" && /^Asia\/(Samarkand|Tashkent)$/.test(detectedTz)) {
      updateProfile({ timezone: detectedTz });
    }
  }, [me, detectedTz]);

  async function finish() {
    if (ws) {
      projects.forEach((name, i) => createProject({ workspace_id: ws.id, name, color: PROJECT_COLORS[(i * 3) % PROJECT_COLORS.length] }));
    }
    updateProfile({ onboarded_at: new Date().toISOString() });
    await flush();
    router.replace("/");
  }

  const addProject = (name: string) => {
    const n = name.trim();
    if (n && !projects.includes(n) && projects.length < 12) setProjects([...projects, n]);
  };

  if (!me || status === "loading") {
    return <main className="flex min-h-dvh items-center justify-center"><LogoMark className="size-10 animate-pulse" /></main>;
  }

  return (
    <main className="flex min-h-dvh flex-col items-center bg-[radial-gradient(ellipse_at_top,var(--brand-soft),transparent_60%)] px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="mb-8 flex items-center justify-between">
          <LogoMark className="size-9" />
          <Button variant="ghost" size="sm" onClick={finish}>{tc("common.skip")}</Button>
        </div>
        <ol className="mb-6 flex gap-2" aria-label="steps">
          {STEPS.map((s, i) => (
            <li key={s} className={cn("h-1.5 flex-1 rounded-full transition-colors", i <= step ? "bg-brand" : "bg-muted")} aria-current={i === step ? "step" : undefined}>
              <span className="sr-only">{t(s)}</span>
            </li>
          ))}
        </ol>

        <div key={step} className="animate-fade-up rounded-3xl border bg-card p-6 shadow-elev-3 sm:p-8">
          {step === 0 && (
            <div className="space-y-6">
              <div>
                <h1 className="text-28 font-bold">{t("welcome")}</h1>
                <p className="mt-1 text-muted-foreground">{t("welcomeBody")}</p>
              </div>
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-medium"><Globe2 className="size-4" /> {tc("settings.language")}</p>
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
                      {l === "uz" ? "Oʻzbekcha" : "English"} {locale === l && <Check className="size-4 text-brand" />}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{tc("settings.timezone")}</p>
                <Select value={me.timezone} onValueChange={(v) => updateProfile({ timezone: v })}>
                  <SelectTrigger aria-label={tc("settings.timezone")} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from(new Set(["Asia/Tashkent", "Asia/Samarkand", detectedTz, "Europe/Moscow", "Europe/Istanbul", "Asia/Dubai", "Europe/London", "UTC"])).map((z) => (
                      <SelectItem key={z} value={z}>{z}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{tc("settings.workDays")}</p>
                <div className="flex gap-1.5">
                  {f.weekdaysShort.map((d, i) => {
                    const dow = i + 1;
                    const on = me.work_days.includes(dow);
                    return (
                      <button
                        key={d}
                        aria-pressed={on}
                        onClick={() => updateProfile({ work_days: on ? me.work_days.filter((x) => x !== dow) : [...me.work_days, dow].sort() })}
                        className={cn("size-10 rounded-full border text-xs font-semibold", on ? "border-brand bg-brand-soft text-brand-fg" : "text-muted-foreground")}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-5">
              <div>
                <h1 className="text-22 font-bold">{t("projectsTitle")}</h1>
                <p className="mt-1 text-muted-foreground">{t("projectsBody")}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => {
                  const on = projects.includes(c);
                  return (
                    <button
                      key={c}
                      onClick={() => (on ? setProjects(projects.filter((p) => p !== c)) : addProject(c))}
                      aria-pressed={on}
                      className={cn("inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors", on ? "border-brand bg-brand-soft text-brand-fg" : "hover:bg-muted")}
                    >
                      {on ? <Check className="size-3.5" /> : <Plus className="size-3.5" />} {c}
                    </button>
                  );
                })}
              </div>
              <form onSubmit={(e) => { e.preventDefault(); addProject(draft); setDraft(""); }} className="flex gap-2">
                <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t("projectsPlaceholder")} aria-label={t("projectsPlaceholder")} />
                <Button type="submit" variant="outline" disabled={!draft.trim()}><Plus /></Button>
              </form>
              {projects.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {projects.map((p, i) => (
                    <li key={p} data-color={PROJECT_COLORS[(i * 3) % PROJECT_COLORS.length]} className="inline-flex items-center gap-1.5 rounded-lg bg-pc-soft py-1 pr-1 pl-2.5 text-sm text-pc-fg">
                      <span className="size-2 rounded-full bg-pc" /> {p}
                      <button onClick={() => setProjects(projects.filter((x) => x !== p))} aria-label={tc("common.delete")} className="rounded p-0.5 hover:bg-black/10"><X className="size-3.5" /></button>
                    </li>
                  ))}
                </ul>
              )}
              <p className="text-xs text-muted-foreground">{t("importHint")}</p>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div>
                <h1 className="flex items-center gap-2 text-22 font-bold"><Send className="size-5 text-info" /> {t("telegramTitle")}</h1>
                <p className="mt-1 text-muted-foreground">{t("telegramBody")}</p>
              </div>
              <div className="[&>div>section]:shadow-none [&>div>section:nth-child(2)]:hidden">
                <IntegrationsSection />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <h1 className="flex items-center gap-2 text-22 font-bold"><BellRing className="size-5 text-brand" /> {t("pushTitle")}</h1>
                <p className="mt-1 text-muted-foreground">{t("pushBody")}</p>
              </div>
              <div className="[&>section]:shadow-none">
                <PushCard />
              </div>
            </div>
          )}

          <div className="mt-8 flex items-center justify-between">
            <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>{tc("common.back")}</Button>
            {step < STEPS.length - 1 ? (
              <Button onClick={() => setStep((s) => s + 1)}>{tc("common.continue")} <ArrowRight /></Button>
            ) : (
              <Button onClick={finish}>{t("finish")} <ArrowRight /></Button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
