"use client";

import { CalendarDays, Copy, Download, FileJson, Link2, Loader2, LogOut, Mail, RefreshCw, Send, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProjectDot, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { ColorPicker } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TELEGRAM_BOT_USERNAME } from "@/lib/env";
import { isDemo, useIsDemo } from "@/hooks/use-demo";
import { downloadText, toCSV } from "@/lib/csv";
import { EXPORT_TABLES, exportFileName, taskCsvRows } from "@/lib/export";
import { useFormat } from "@/lib/format";
import { isWorkspaceAdmin } from "@/lib/permissions";
import type { Note, Project, ProjectTemplateData, Task, WorkspaceRole } from "@/lib/types";
import { createLabel, createProject, createWorkspace, deleteLabel, deleteTaskForever, restoreProject, restoreTask, updateLabel, updateProfile, updateWorkspace } from "@/store/actions";
import { useCurrentWorkspace, useLabels, useMe, useMembers, useToday, useTz, useUserId, useWorkspaceRole, useWorkspaces } from "@/store/hooks";
import { mergeRows, mutate, useStore } from "@/store/store";
import { createInvitation } from "@/server/actions/invitations";
import { integrationStatus, sendTestNotification, type IntegrationStatus } from "@/server/actions/notifications";
import { SettingsCard, SettingsRow } from "./common";
import { DemoImportCard } from "./demo-import";
import { ImportPanel } from "./import";
import { useSyncedState } from "@/hooks/use-synced-state";

/** Export the workspace from the data loaded in this browser (used by the demo). */
function exportInBrowser(ws: { id: string; name: string }, format: "json" | "csv") {
  const d = useStore.getState().data;
  const rows = (table: (typeof EXPORT_TABLES)[number]) =>
    Object.values(d[table] as unknown as Record<string, Record<string, unknown>>).filter((r) => r.workspace_id === ws.id);
  if (format === "csv") {
    downloadText(exportFileName(ws.name, "csv"), toCSV(taskCsvRows(rows("tasks"), rows("projects"), rows("sections"))));
    return;
  }
  const out: Record<string, unknown> = { exported_at: new Date().toISOString(), workspace: { id: ws.id, name: ws.name } };
  for (const table of EXPORT_TABLES) out[table] = rows(table);
  downloadText(exportFileName(ws.name, "json"), JSON.stringify(out, null, 2), "application/json");
}

// ------------------------------------------------------------------ Telegram & calendar

export function IntegrationsSection() {
  const t = useTranslations();
  const me = useMe();
  const adapter = useStore((s) => s.adapter);
  const [code, setCode] = useState<string | null>(null);
  const demo = useIsDemo();
  const [serverStatus, setStatus] = useState<IntegrationStatus | null>(null);
  const status: IntegrationStatus | null = demo ? { telegram: false, push: false, email: false } : serverStatus;
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!demo) void integrationStatus().then(setStatus);
  }, [demo]);

  if (!me) return null;
  const icsUrl = me.ics_token && typeof window !== "undefined" ? `${window.location.origin}/api/ics/${me.ics_token}` : "";
  const copy = (s: string) => {
    void navigator.clipboard.writeText(s);
    toast.success(t("common.copied"));
  };

  return (
    <div className="space-y-5">
      <SettingsCard title={<span className="flex items-center gap-2"><Send className="size-4 text-info" /> {t("settings.telegramTitle")}</span>} description={t("settings.telegramHint")}>
        {status && !status.telegram ? (
          // the bot is not set up on this server: say so plainly, without configuration details
          <p className="px-5 py-4 text-13 text-muted-foreground">{t("settings.telegramUnavailable")}</p>
        ) : me.telegram_chat_id ? (
          <SettingsRow label={t("settings.telegramConnected", { username: me.telegram_username ? `@${me.telegram_username}` : String(me.telegram_chat_id) })}>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const res = await sendTestNotification("telegram");
                if (res.ok) toast.success(t("settings.telegramTestSent"));
                else toast.error(res.error ?? t("common.error"));
              }}
            >
              <Send /> {t("settings.telegramTest")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => adapter?.rpc("unlink_telegram").then(() => useStore.setState((s) => ({ data: { ...s.data, profiles: { ...s.data.profiles, [me.id]: { ...me, telegram_chat_id: null, telegram_username: null } } } })))}>
              {t("settings.telegramDisconnect")}
            </Button>
          </SettingsRow>
        ) : code ? (
          <div className="space-y-3 px-5 py-4">
            <p className="text-13">{t("settings.telegramCode")}</p>
            <div className="flex items-center gap-2">
              <code className="rounded-lg bg-muted px-3 py-2 font-mono text-lg font-semibold tracking-widest">{code}</code>
              <Button variant="ghost" size="icon-sm" onClick={() => copy(code)} aria-label={t("common.copy")}><Copy /></Button>
              {TELEGRAM_BOT_USERNAME && (
                <Button asChild size="sm">
                  <a href={`https://t.me/${TELEGRAM_BOT_USERNAME}?start=${code}`} target="_blank" rel="noopener noreferrer"><Send /> {t("settings.telegramOpenBot")}</a>
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{t("settings.telegramCodeExpires")}</p>
          </div>
        ) : (
          <SettingsRow label={t("settings.telegramNotLinked")} description={t("settings.telegramLinkHint")}>
            <Button
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  setCode(await adapter!.rpc<string>("create_telegram_link_code"));
                } catch (e) {
                  toast.error((e as Error).message);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? <Loader2 className="animate-spin" /> : <Send />} {t("settings.telegramConnect")}
            </Button>
          </SettingsRow>
        )}
      </SettingsCard>

      <SettingsCard title={<span className="flex items-center gap-2"><CalendarDays className="size-4 text-success" /> {t("settings.calendarTitle")}</span>} description={t("settings.calendarHint")}>
        <div className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center">
          <Input readOnly value={icsUrl} className="flex-1 font-mono text-xs" aria-label={t("settings.calendarTitle")} onFocus={(e) => e.target.select()} />
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => copy(icsUrl)}><Copy /> {t("settings.calendarCopy")}</Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const token = await adapter!.rpc<string>("regenerate_ics_token");
                useStore.setState((s) => ({ data: { ...s.data, profiles: { ...s.data.profiles, [me.id]: { ...me, ics_token: token } } } }));
                toast.success(t("settings.calendarRegenerated"));
              }}
            >
              <RefreshCw /> {t("settings.calendarRegenerate")}
            </Button>
          </div>
        </div>
      </SettingsCard>
    </div>
  );
}

// ------------------------------------------------------------------ workspace & members

export function WorkspaceSection() {
  const t = useTranslations();
  const params = useSearchParams();
  const router = useRouter();
  const uid = useUserId();
  const ws = useCurrentWorkspace();
  const workspaces = useWorkspaces();
  const role = useWorkspaceRole(ws?.id);
  const admin = isWorkspaceAdmin(role);
  const [name, setName] = useSyncedState(ws?.name ?? "");
  const [newName, setNewName] = useState("");
  const newRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (params.get("new")) newRef.current?.focus();
  }, [params]);
  if (!ws) return null;

  return (
    <div className="space-y-5">
      <SettingsCard title={t("settings.workspace")}>
        <SettingsRow label={t("settings.workspaceName")} htmlFor="ws-name">
          <Input id="ws-name" className="w-64" value={name} disabled={!admin} onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== ws.name && updateWorkspace(ws.id, { name: name.trim() })} />
        </SettingsRow>
        <SettingsRow label={t("common.color")}>
          <ColorPicker value={ws.color} onChange={(c) => admin && updateWorkspace(ws.id, { color: c })} />
        </SettingsRow>
        {!ws.is_personal && role !== "owner" && (
          <SettingsRow label={t("settings.leave")}>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                mutate([{ table: "workspace_members", kind: "delete", row: { workspace_id: ws.id, user_id: uid } }]);
                const other = workspaces.find((w) => w.id !== ws.id);
                if (other) updateProfile({ current_workspace_id: other.id });
                router.push("/");
              }}
            >
              <LogOut /> {t("settings.leave")}
            </Button>
          </SettingsRow>
        )}
      </SettingsCard>

      <MembersCard workspaceId={ws.id} admin={admin} />

      <SettingsCard title={t("settings.workspacesTitle")}>
        <ul className="divide-y">
          {workspaces.map((w) => (
            <li key={w.id} className="flex items-center gap-3 px-5 py-3 text-sm">
              <ProjectDot color={w.color} />
              <span className="flex-1">{w.name}</span>
              {w.is_personal && <span className="text-xs text-muted-foreground">{t("settings.personalWorkspace")}</span>}
              {w.id !== ws.id && <Button variant="ghost" size="sm" onClick={() => updateProfile({ current_workspace_id: w.id })}>{t("common.open")}</Button>}
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2 px-5 py-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            createWorkspace(newName);
            setNewName("");
            toast.success(t("common.saved"));
          }}
        >
          <Input ref={newRef} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("settings.createWorkspace")} aria-label={t("settings.createWorkspace")} />
          <Button type="submit" disabled={!newName.trim()}>{t("common.create")}</Button>
        </form>
      </SettingsCard>
    </div>
  );
}

function MembersCard({ workspaceId, admin }: { workspaceId: string; admin: boolean }) {
  const t = useTranslations();
  const uid = useUserId();
  const members = useMembers(workspaceId);
  const invitations = useStore((s) => s.data.invitations);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "guest">("member");
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const pending = useMemo(
    () => Object.values(invitations).filter((i) => i.workspace_id === workspaceId && !i.project_id && !i.revoked_at && new Date(i.expires_at) > new Date() && (i.email ? !i.accepted_at : true)),
    [invitations, workspaceId],
  );

  async function invite(withEmail: boolean) {
    if (isDemo()) {
      toast.message(t("app.demoBanner"));
      return;
    }
    setBusy(true);
    const res = await createInvitation({ workspaceId, projectId: null, email: withEmail ? email.trim() : null, role, expiresDays: days });
    setBusy(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    setLink(res.url);
    if (withEmail) setEmail("");
    toast.success(withEmail && res.emailed ? t("settings.inviteSent") : t("settings.inviteLinkCreated"));
    const fresh = await useStore.getState().adapter?.loadAll(uid);
    if (fresh?.invitations) useStore.setState((s) => ({ data: { ...s.data, invitations: fresh.invitations! } }));
  }

  return (
    <SettingsCard title={t("settings.members")}>
      {admin && (
        <div className="space-y-2 px-5 py-4">
          <form className="flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); if (email.trim()) void invite(true); }}>
            <Input type="email" placeholder={t("auth.emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} aria-label={t("common.email")} />
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger aria-label={t("settings.inviteRole")} className="sm:w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {(["admin", "member", "guest"] as const).map((r) => <SelectItem key={r} value={r}>{t(`settings.roles.${r}`)}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="submit" disabled={busy || !email.trim()}>{busy ? <Loader2 className="animate-spin" /> : <Mail />} {t("settings.inviteSend")}</Button>
          </form>
          <p className="text-xs text-muted-foreground">{t(`settings.roleHints.${role}`)}</p>
          <div className="flex items-center gap-2">
            <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as 1 | 7 | 30)}>
              <SelectTrigger className="h-8 w-32" aria-label={t("settings.inviteExpires")}><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">{t("settings.days1")}</SelectItem>
                <SelectItem value="7">{t("settings.days7")}</SelectItem>
                <SelectItem value="30">{t("settings.days30")}</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => invite(false)} disabled={busy}><Link2 /> {t("settings.inviteCreateLink")}</Button>
          </div>
          {link && (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
              <code className="flex-1 truncate text-xs">{link}</code>
              <Button size="icon-sm" variant="ghost" aria-label={t("common.copy")} onClick={() => { void navigator.clipboard.writeText(link); toast.success(t("common.copied")); }}><Copy /></Button>
            </div>
          )}
        </div>
      )}
      <ul className="divide-y">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-5 py-3">
            <UserAvatar profile={m} size={32} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{m.name}{m.id === uid && <span className="text-muted-foreground"> · {t("common.you")}</span>}</p>
              <p className="truncate text-xs text-muted-foreground">{m.email}</p>
            </div>
            {admin && m.role !== "owner" && m.id !== uid ? (
              <>
                <Select value={m.role} onValueChange={(v) => mutate([{ table: "workspace_members", kind: "update", row: { workspace_id: workspaceId, user_id: m.id }, values: { role: v as WorkspaceRole } }])}>
                  <SelectTrigger aria-label={t("common.role")} className="h-8 w-36"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["admin", "member", "guest"] as const).map((r) => <SelectItem key={r} value={r}>{t(`settings.roles.${r}`)}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon-sm" aria-label={t("settings.removeMember")} onClick={() => mutate([{ table: "workspace_members", kind: "delete", row: { workspace_id: workspaceId, user_id: m.id } }])}>
                  <X />
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">{t(`settings.roles.${m.role}`)}</span>
            )}
          </li>
        ))}
      </ul>
      {pending.length > 0 && (
        <div className="px-5 py-3">
          <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("settings.pendingInvites")}</p>
          <ul className="space-y-1">
            {pending.map((i) => (
              <li key={i.id} className="flex items-center gap-2 text-13">
                {i.email ? <Mail className="size-4 text-muted-foreground" /> : <Link2 className="size-4 text-muted-foreground" />}
                <span className="flex-1 truncate">{i.email ?? t("common.link")}</span>
                <span className="text-xs text-muted-foreground">{t(`settings.roles.${i.role}`)}</span>
                {admin && (
                  <Button variant="ghost" size="icon-sm" aria-label={t("settings.inviteRevoke")} onClick={() => mutate([{ table: "invitations", kind: "update", row: { id: i.id }, values: { revoked_at: new Date().toISOString() } }])}>
                    <Trash2 />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ labels & templates

export function LabelsSection() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const labels = useLabels(ws?.id);
  const [name, setName] = useState("");
  const [color, setColor] = useState("sky");
  if (!ws) return null;
  return (
    <SettingsCard title={t("settings.labels")} description={t("settings.labelsHint")}>
      <ul className="divide-y">
        {labels.map((l) => (
          <li key={l.id} className="flex items-center gap-3 px-5 py-2.5">
            <span data-color={l.color} className="size-3 rounded-full bg-pc" />
            <Input defaultValue={l.name} className="h-8 max-w-xs" onBlur={(e) => e.target.value.trim() && e.target.value !== l.name && updateLabel(l.id, { name: e.target.value.trim() })} aria-label={t("common.name")} />
            <div className="hidden flex-1 md:block">
              <ColorPicker value={l.color} onChange={(c) => updateLabel(l.id, { color: c })} />
            </div>
            <Button variant="ghost" size="icon-sm" className="ml-auto" aria-label={t("common.delete")} onClick={() => deleteLabel(l.id)}><Trash2 /></Button>
          </li>
        ))}
      </ul>
      <form
        className="flex flex-wrap items-center gap-3 px-5 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createLabel(ws.id, name, color);
          setName("");
        }}
      >
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("settings.newLabel")} className="max-w-xs" aria-label={t("settings.newLabel")} />
        <ColorPicker value={color} onChange={setColor} />
        <Button type="submit" disabled={!name.trim()}>{t("common.add")}</Button>
      </form>
    </SettingsCard>
  );
}

export function TemplatesSection() {
  const t = useTranslations();
  const router = useRouter();
  const ws = useCurrentWorkspace();
  const templates = useStore((s) => s.data.templates);
  const list = useMemo(() => Object.values(templates).filter((x) => x.workspace_id === ws?.id && x.kind === "project"), [templates, ws?.id]);
  return (
    <SettingsCard title={t("settings.templates")} description={t("settings.templatesHint")}>
      {list.length === 0 ? (
        <p className="px-5 py-6 text-center text-13 text-muted-foreground">{t("settings.noTemplates")}</p>
      ) : (
        <ul className="divide-y">
          {list.map((tp) => {
            const data = tp.data as ProjectTemplateData;
            return (
              <li key={tp.id} className="flex items-center gap-3 px-5 py-3">
                <Sparkles className="size-4 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{tp.name}</p>
                  <p className="text-xs text-muted-foreground">{data.sections.length} · {t("project.tasksCount", { count: data.tasks.length })}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const p = createProject({ workspace_id: ws!.id, name: tp.name, color: data.color ?? "sky" }, { sections: data.sections, tasks: data.tasks });
                    router.push(`/projects/${p.id}`);
                  }}
                >
                  {t("common.create")}
                </Button>
                <Button size="icon-sm" variant="ghost" aria-label={t("common.delete")} onClick={() => mutate([{ table: "templates", kind: "delete", row: { id: tp.id } }])}><Trash2 /></Button>
              </li>
            );
          })}
        </ul>
      )}
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ trash

export function TrashSection() {
  const t = useTranslations();
  const demo = useIsDemo();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const workspaces = useWorkspaces();
  const adapter = useStore((s) => s.adapter);
  const tasks = useStore((s) => s.data.tasks);
  const projects = useStore((s) => s.data.projects);
  const notes = useStore((s) => s.data.notes);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!adapter || workspaces.length === 0) return;
    void adapter.loadTrash(workspaces.map((w) => w.id)).then((rows) => {
      mergeRows(rows);
      setLoaded(true);
    });
  }, [adapter, workspaces]);

  const items = useMemo(() => {
    const out: { id: string; kind: "task" | "project" | "note"; title: string; deleted_at: string; row: Task | Project | Note }[] = [];
    for (const x of Object.values(tasks)) if (x.deleted_at) out.push({ id: x.id, kind: "task", title: x.title, deleted_at: x.deleted_at, row: x });
    for (const x of Object.values(projects)) if (x.deleted_at) out.push({ id: x.id, kind: "project", title: x.name, deleted_at: x.deleted_at, row: x });
    for (const x of Object.values(notes)) if (x.deleted_at) out.push({ id: x.id, kind: "note", title: x.title || t("notes.untitled"), deleted_at: x.deleted_at, row: x });
    return out.sort((a, b) => b.deleted_at.localeCompare(a.deleted_at));
  }, [tasks, projects, notes, t]);

  return (
    <SettingsCard title={t("settings.trash")} description={t("settings.trashHint")}>
      {!loaded && !demo ? (
        <div className="m-5 h-16 animate-pulse rounded-lg bg-muted" />
      ) : items.length === 0 ? (
        <EmptyState compact illustration="trash" title={t("settings.trashEmpty")} />
      ) : (
        <ul className="divide-y">
          {items.map((it) => (
            <li key={`${it.kind}${it.id}`} className="flex items-center gap-3 px-5 py-2.5">
              <span className="rounded bg-muted px-1.5 py-0.5 text-2xs font-medium text-muted-foreground uppercase">{t(it.kind === "task" ? "task.titlePlaceholder" : it.kind === "project" ? "nav.projects" : "views.notes")}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{it.title}</p>
                <p className="text-xs text-muted-foreground">{t("settings.deletedAgo", { date: f.ago(it.deleted_at) })}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  if (it.kind === "task") restoreTask(it.id);
                  else if (it.kind === "project") restoreProject(it.id);
                  else mutate([{ table: "notes", kind: "update", row: { id: it.id }, values: { deleted_at: null } }]);
                }}
              >
                <Undo2 /> {t("common.restore")}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={t("common.deleteForever")}
                onClick={() => {
                  if (!window.confirm(t("common.deleteForever"))) return;
                  if (it.kind === "task") deleteTaskForever(it.id);
                  else mutate([{ table: it.kind === "project" ? "projects" : "notes", kind: "delete", row: { id: it.id } }]);
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}

// ------------------------------------------------------------------ export & import

export function DataSection() {
  const t = useTranslations();
  const demo = useIsDemo();
  const ws = useCurrentWorkspace();

  if (!ws) return null;
  return (
    <div className="space-y-5">
      <SettingsCard title={t("settings.exportTitle")} description={t("settings.exportHint")}>
        <div className="flex flex-wrap gap-2 px-5 py-4">
          {demo ? (
            // the demo has no server copy: build the files from the data in this browser
            <>
              <Button variant="outline" onClick={() => exportInBrowser(ws, "json")}><FileJson /> {t("settings.exportJson")}</Button>
              <Button variant="outline" onClick={() => exportInBrowser(ws, "csv")}><Download /> {t("settings.exportCsv")}</Button>
            </>
          ) : (
            <>
              <Button asChild variant="outline"><a href={`/api/export?workspace=${ws.id}&format=json`}><FileJson /> {t("settings.exportJson")}</a></Button>
              <Button asChild variant="outline"><a href={`/api/export?workspace=${ws.id}&format=csv`}><Download /> {t("settings.exportCsv")}</a></Button>
            </>
          )}
        </div>
      </SettingsCard>
      <DemoImportCard />
      <SettingsCard title={t("settings.importTitle")} description={t("settings.importHint")}>
        <div className="px-5 py-4">
          <ImportPanel />
        </div>
      </SettingsCard>
    </div>
  );
}
