"use client";

import { Archive, History, Laptop, Loader2, LogOut, Smartphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useIsDemo } from "@/hooks/use-demo";
import { describeDevice } from "@/lib/devices";
import { useFormat } from "@/lib/format";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { AuditEntry, Profile } from "@/lib/types";
import { updateProfile } from "@/store/actions";
import { useProfiles, useToday, useTz } from "@/store/hooks";
import { SettingsCard, SettingsRow } from "./common";

interface SessionRow {
  id: string;
  created_at: string;
  last_active_at: string | null;
  user_agent: string | null;
  ip: string | null;
  current: boolean;
}

/** Where this account is signed in, with sign-out of other devices. */
export function DevicesCard() {
  const t = useTranslations("trust");
  const demo = useIsDemo();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const [rows, setRows] = useState<SessionRow[] | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void getBrowserSupabase()
      .rpc("my_sessions")
      .then(({ data, error }) => !cancelled && setRows(error ? [] : ((data ?? []) as SessionRow[])));
    return () => {
      cancelled = true;
    };
  }, [demo, version]);
  const end = async (fn: "end_session" | "end_other_sessions", id?: string) => {
    const { error } = await getBrowserSupabase().rpc(fn, id ? { p_session: id } : {});
    if (error) toast.error(error.message);
    else toast.success(t("signedOut"));
    setVersion((v) => v + 1);
  };

  return (
    <SettingsCard title={t("devicesTitle")} description={t("devicesHint")}>
      {demo ? (
        <p className="px-5 py-4 text-13 text-muted-foreground">{t("demoNote")}</p>
      ) : rows === null ? (
        <p className="px-5 py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></p>
      ) : (
        <>
          <ul className="divide-y" aria-label={t("devicesTitle")}>
            {rows.map((s) => {
              const d = describeDevice(s.user_agent);
              return (
                <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                  {d.mobile ? <Smartphone className="size-5 shrink-0 text-muted-foreground" /> : <Laptop className="size-5 shrink-0 text-muted-foreground" />}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {d.label || t("unknownDevice")}
                      {s.current && <span className="ml-2 rounded-full bg-success-soft px-2 py-0.5 text-2xs font-semibold text-success-fg">{t("thisDevice")}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground tnum">
                      {t("lastActive", { when: f.ago(s.last_active_at ?? s.created_at) })}
                      {s.ip && ` · ${s.ip}`}
                    </p>
                  </div>
                  {!s.current && (
                    <Button variant="outline" size="sm" onClick={() => end("end_session", s.id)}>
                      <LogOut /> {t("signOut")}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
          {rows.filter((s) => !s.current).length > 0 && (
            <div className="px-5 py-3">
              <Button variant="ghost" size="sm" className="text-destructive" onClick={() => end("end_other_sessions")}>
                <LogOut /> {t("signOutOthers")}
              </Button>
            </div>
          )}
        </>
      )}
    </SettingsCard>
  );
}

/** Weekly backup by email, and a one-click export of everything. */
export function BackupCard({ me }: { me: Profile }) {
  const t = useTranslations("trust");
  const demo = useIsDemo();
  return (
    <SettingsCard title={<span className="flex items-center gap-2"><Archive className="size-4 text-info-fg" /> {t("backupTitle")}</span>} description={t("backupHint")}>
      <SettingsRow label={t("backupWeekly")} description={t("backupWeeklyHint")}>
        <Switch checked={me.backup_enabled} onCheckedChange={(v) => updateProfile({ backup_enabled: v })} aria-label={t("backupWeekly")} />
      </SettingsRow>
      {!demo && (
        <SettingsRow label={t("exportAll")} description={t("exportAllHint")}>
          <Button asChild variant="outline" size="sm"><a href="/api/export?scope=account">{t("exportAllButton")}</a></Button>
        </SettingsRow>
      )}
    </SettingsCard>
  );
}

const ACTIONS = ["member_added", "role_changed", "member_removed", "project_deleted", "project_deleted_forever", "project_restored", "modules_changed", "money_settings_changed", "invite_created", "invite_revoked", "expense_approved", "expense_rejected", "data_exported"];

/** Who changed roles, deleted projects or exported data — for workspace admins. */
export function AuditCard({ workspaceId }: { workspaceId: string }) {
  const t = useTranslations("trust");
  const tr = useTranslations();
  const demo = useIsDemo();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const profiles = useProfiles();
  const [rows, setRows] = useState<AuditEntry[] | null>(null);
  useEffect(() => {
    if (demo) return;
    let cancelled = false;
    void getBrowserSupabase()
      .from("audit_log")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => !cancelled && setRows((data ?? []) as AuditEntry[]));
    return () => {
      cancelled = true;
    };
  }, [demo, workspaceId]);
  const describe = (e: AuditEntry) => {
    const d = e.details as Record<string, string | number | null>;
    const role = (r: unknown) => (r ? tr(`settings.roles.${r}`) : "");
    const key = ACTIONS.includes(e.action) ? e.action : "other";
    return t(`audit.${key}`, { name: String(d.name ?? ""), from: role(d.from), to: role(d.to), role: role(d.role), format: String(d.format ?? ""), email: String(d.email ?? ""), action: e.action });
  };
  return (
    <SettingsCard title={<span className="flex items-center gap-2"><History className="size-4" /> {t("auditTitle")}</span>} description={t("auditHint")}>
      {demo ? (
        <p className="px-5 py-4 text-13 text-muted-foreground">{t("demoNote")}</p>
      ) : rows === null ? (
        <p className="px-5 py-4"><Loader2 className="size-4 animate-spin text-muted-foreground" /></p>
      ) : rows.length === 0 ? (
        <p className="px-5 py-4 text-13 text-muted-foreground">{t("auditEmpty")}</p>
      ) : (
        <ul className="max-h-96 divide-y overflow-y-auto" aria-label={t("auditTitle")}>
          {rows.map((e) => (
            <li key={e.id} className="flex gap-3 px-5 py-2.5 text-13">
              <span className="w-28 shrink-0 text-xs text-muted-foreground tnum">{f.dayMonth(e.created_at.slice(0, 10))}, {f.time(e.created_at)}</span>
              <span className="min-w-0 flex-1">
                <b className="font-medium">{e.actor_id ? (profiles[e.actor_id]?.name ?? t("someone")) : t("system")}</b> {describe(e)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
