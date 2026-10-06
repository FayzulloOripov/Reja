"use client";

import { useEffect, useMemo, useState } from "react";
import { todayIn, minutesOfDay } from "@/lib/dates";
import { DEFAULT_TIMEZONE } from "@/lib/env";
import { suggestHealth, effectiveHealth, isOpen } from "@/lib/health";
import { projectAccess, type Access } from "@/lib/permissions";
import { isDelegatedBy, responsibleIds } from "@/lib/tasks/responsible";
import type {
  ActivityEntry,
  Area,
  ChecklistItem,
  Contact,
  Label,
  Meeting,
  Profile,
  Project,
  Routine,
  Section,
  Task,
  TaskAssignee,
  TaskLabel,
  Workspace,
  WorkspaceRole,
} from "@/lib/types";
import { useStore } from "./store";

// ------------------------------------------------------------------ memo helpers

/** Cache a derived value on the identity of its input (one entry per function). */
function memo1<A extends object, R>(fn: (a: A) => R): (a: A) => R {
  let lastA: A | undefined;
  let lastR: R;
  return (a: A) => {
    if (a !== lastA) {
      lastA = a;
      lastR = fn(a);
    }
    return lastR;
  };
}

function groupBy<T>(rows: Record<string, T>, key: (r: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const r of Object.values(rows)) {
    const k = key(r);
    (out[k] ??= []).push(r);
  }
  return out;
}

export const liveTasks = memo1((tasks: Record<string, Task>) => Object.values(tasks).filter((t) => !t.deleted_at));
export const assigneesByTask = memo1((rows: Record<string, TaskAssignee>) => groupBy(rows, (r) => r.task_id));
export const labelsByTask = memo1((rows: Record<string, TaskLabel>) => groupBy(rows, (r) => r.task_id));
export const checklistByTask = memo1((rows: Record<string, ChecklistItem>) => groupBy(rows, (r) => r.task_id));
export const subtasksByParent = memo1((tasks: Record<string, Task>) => {
  const out: Record<string, Task[]> = {};
  for (const t of Object.values(tasks)) if (t.parent_id && !t.deleted_at) (out[t.parent_id] ??= []).push(t);
  for (const k of Object.keys(out)) out[k].sort((a, b) => a.position - b.position);
  return out;
});
export const commentsByTask = memo1((rows: Record<string, { task_id: string; deleted_at: string | null }>) => {
  const out: Record<string, number> = {};
  for (const c of Object.values(rows)) if (!c.deleted_at) out[c.task_id] = (out[c.task_id] ?? 0) + 1;
  return out;
});
export const tasksByProject = memo1((tasks: Record<string, Task>) => {
  const out: Record<string, Task[]> = {};
  for (const t of Object.values(tasks)) if (!t.deleted_at && t.project_id) (out[t.project_id] ??= []).push(t);
  return out;
});

// ------------------------------------------------------------------ identity & time

export function useUserId(): string {
  return useStore((s) => s.userId) ?? "";
}

export function useMe(): Profile | undefined {
  const uid = useStore((s) => s.userId);
  return useStore((s) => (uid ? s.data.profiles[uid] : undefined));
}

export function useTz(): string {
  return useMe()?.timezone || DEFAULT_TIMEZONE;
}

/** Today's date in the user's zone; re-renders when the date changes. */
export function useToday(): string {
  const tz = useTz();
  const [today, setToday] = useState(() => todayIn(tz));
  const [prevTz, setPrevTz] = useState(tz);
  if (prevTz !== tz) {
    setPrevTz(tz);
    setToday(todayIn(tz));
  }
  useEffect(() => {
    const id = setInterval(() => setToday(todayIn(tz)), 60_000);
    return () => clearInterval(id);
  }, [tz]);
  return today;
}

/** Minutes since local midnight, refreshed every minute (for the "now" line). */
export function useNowMinutes(): number {
  const tz = useTz();
  const [m, setM] = useState(() => minutesOfDay(tz, new Date()));
  useEffect(() => {
    const id = setInterval(() => setM(minutesOfDay(tz, new Date())), 60_000);
    return () => clearInterval(id);
  }, [tz]);
  return m;
}

// ------------------------------------------------------------------ workspaces & people

export function useWorkspaces(): Workspace[] {
  const ws = useStore((s) => s.data.workspaces);
  const members = useStore((s) => s.data.workspace_members);
  const uid = useUserId();
  return useMemo(() => {
    const mine = new Set(Object.values(members).filter((m) => m.user_id === uid).map((m) => m.workspace_id));
    return Object.values(ws)
      .filter((w) => !w.deleted_at && mine.has(w.id))
      .sort((a, b) => Number(b.is_personal) - Number(a.is_personal) || a.created_at.localeCompare(b.created_at));
  }, [ws, members, uid]);
}

export function useCurrentWorkspace(): Workspace | undefined {
  const me = useMe();
  const list = useWorkspaces();
  return useMemo(() => list.find((w) => w.id === me?.current_workspace_id) ?? list.find((w) => !w.is_personal) ?? list[0], [list, me?.current_workspace_id]);
}

export function useWorkspaceRole(workspaceId: string | undefined): WorkspaceRole | null {
  const uid = useUserId();
  return useStore((s) => (workspaceId ? s.data.workspace_members[`${workspaceId}|${uid}`]?.role ?? null : null));
}

export interface Member extends Profile {
  role: WorkspaceRole;
}

export function useMembers(workspaceId: string | undefined): Member[] {
  const members = useStore((s) => s.data.workspace_members);
  const profiles = useStore((s) => s.data.profiles);
  return useMemo(() => {
    if (!workspaceId) return [];
    return Object.values(members)
      .filter((m) => m.workspace_id === workspaceId && profiles[m.user_id])
      .map((m) => ({ ...profiles[m.user_id], role: m.role }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [members, profiles, workspaceId]);
}

/** People who can open a project (for assignment pickers and @mentions). */
export function useProjectPeople(project: Project | undefined): Profile[] {
  const members = useStore((s) => s.data.workspace_members);
  const pms = useStore((s) => s.data.project_members);
  const profiles = useStore((s) => s.data.profiles);
  const uid = useUserId();
  return useMemo(() => {
    if (!project) return profiles[uid] ? [profiles[uid]] : [];
    const ids = new Set<string>();
    for (const m of Object.values(members)) {
      if (m.workspace_id !== project.workspace_id) continue;
      const pm = pms[`${project.id}|${m.user_id}`]?.role;
      if (projectAccess(m.user_id, project, m.role, pm)) ids.add(m.user_id);
    }
    return [...ids].map((id) => profiles[id]).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
  }, [members, pms, profiles, project, uid]);
}

export function useProfiles(): Record<string, Profile> {
  return useStore((s) => s.data.profiles);
}

// ------------------------------------------------------------------ areas

export function useAreas(workspaceId?: string): Area[] {
  const areas = useStore((s) => s.data.areas);
  return useMemo(
    () =>
      Object.values(areas)
        .filter((a) => !a.deleted_at && !a.archived_at && (!workspaceId || a.workspace_id === workspaceId))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [areas, workspaceId],
  );
}

// ------------------------------------------------------------------ projects

export function useProjects(workspaceId?: string, opts: { includeArchived?: boolean } = {}): Project[] {
  const projects = useStore((s) => s.data.projects);
  return useMemo(
    () =>
      Object.values(projects)
        .filter((p) => !p.deleted_at && (!workspaceId || p.workspace_id === workspaceId) && (opts.includeArchived || p.status !== "archived"))
        .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)),
    [projects, workspaceId, opts.includeArchived],
  );
}

export function useProject(id: string | null | undefined): Project | undefined {
  return useStore((s) => (id ? s.data.projects[id] : undefined));
}

export function useProjectAccess(project: Project | undefined): Access {
  const uid = useUserId();
  const wsRole = useWorkspaceRole(project?.workspace_id);
  const pmRole = useStore((s) => (project ? s.data.project_members[`${project.id}|${uid}`]?.role : undefined));
  return project ? projectAccess(uid, project, wsRole, pmRole) : "manage";
}

export function useFavorites(): Project[] {
  const favs = useStore((s) => s.data.project_favorites);
  const projects = useStore((s) => s.data.projects);
  const uid = useUserId();
  return useMemo(
    () =>
      Object.values(favs)
        .filter((f) => f.user_id === uid && projects[f.project_id] && !projects[f.project_id].deleted_at)
        .sort((a, b) => a.position - b.position)
        .map((f) => projects[f.project_id]),
    [favs, projects, uid],
  );
}

export function useSections(projectId: string | undefined): Section[] {
  const sections = useStore((s) => s.data.sections);
  return useMemo(
    () => Object.values(sections).filter((s) => s.project_id === projectId && !s.deleted_at).sort((a, b) => a.position - b.position),
    [sections, projectId],
  );
}

export function useProjectHealth(project: Project | undefined) {
  const tasks = useStore((s) => s.data.tasks);
  const today = useToday();
  return useMemo(() => {
    if (!project) return null;
    const list = tasksByProject(tasks)[project.id] ?? [];
    const s = suggestHealth(project, list, today);
    return { ...s, effective: effectiveHealth(project, s.health) };
  }, [project, tasks, today]);
}

// ------------------------------------------------------------------ tasks

export function useTask(id: string | null | undefined): Task | undefined {
  return useStore((s) => (id ? s.data.tasks[id] : undefined));
}

export function useAllTasks(): Task[] {
  const tasks = useStore((s) => s.data.tasks);
  return liveTasks(tasks);
}

export function useSubtasks(taskId: string | undefined): Task[] {
  const tasks = useStore((s) => s.data.tasks);
  return (taskId && subtasksByParent(tasks)[taskId]) || EMPTY;
}

export function useChecklist(taskId: string | undefined): ChecklistItem[] {
  const rows = useStore((s) => s.data.checklist_items);
  return useMemo(() => ((taskId && checklistByTask(rows)[taskId]) || []).slice().sort((a, b) => a.position - b.position), [rows, taskId]);
}

export function useTaskAssigneeIds(taskId: string | undefined): string[] {
  const rows = useStore((s) => s.data.task_assignees);
  return useMemo(() => ((taskId && assigneesByTask(rows)[taskId]) || []).map((a) => a.user_id), [rows, taskId]);
}

export function useTaskLabels(taskId: string | undefined): Label[] {
  const rows = useStore((s) => s.data.task_labels);
  const labels = useStore((s) => s.data.labels);
  return useMemo(
    () => ((taskId && labelsByTask(rows)[taskId]) || []).map((r) => labels[r.label_id]).filter((l): l is Label => Boolean(l && !l.deleted_at)),
    [rows, labels, taskId],
  );
}

export function useLabels(workspaceId: string | undefined): Label[] {
  const labels = useStore((s) => s.data.labels);
  return useMemo(
    () => Object.values(labels).filter((l) => l.workspace_id === workspaceId && !l.deleted_at).sort((a, b) => a.name.localeCompare(b.name)),
    [labels, workspaceId],
  );
}

/** Tasks the signed-in user is responsible for: assigned to them, or created by them with no assignee. */
export function useMyTasks(): Task[] {
  const tasks = useStore((s) => s.data.tasks);
  const assignees = useStore((s) => s.data.task_assignees);
  const uid = useUserId();
  return useMemo(() => {
    const byTask = assigneesByTask(assignees);
    return liveTasks(tasks).filter((t) => {
      if (t.parent_id) return false;
      const owners = responsibleIds(t, byTask);
      return owners.length ? owners.includes(uid) : true;
    });
  }, [tasks, assignees, uid]);
}

export function useUnreadCount(): number {
  const n = useStore((s) => s.data.notifications);
  const uid = useUserId();
  return useMemo(() => Object.values(n).filter((x) => x.user_id === uid && !x.read_at).length, [n, uid]);
}

export function useOpenTasks(list: Task[]): Task[] {
  return useMemo(() => list.filter(isOpen), [list]);
}

const EMPTY: Task[] = [];

// ------------------------------------------------------------------ activity

/**
 * Activity for a workspace, project or task. Reloads shortly after tasks, projects or comments
 * change, so the feed follows what just happened (the server writes entries with triggers).
 */
export function useActivity(scope: { workspaceId?: string; projectId?: string; taskId?: string }, limit = 50, enabled = true): ActivityEntry[] | null {
  const adapter = useStore((s) => s.adapter);
  const log = useStore((s) => s.data.activity_log);
  const tasks = useStore((s) => s.data.tasks);
  const projects = useStore((s) => s.data.projects);
  const comments = useStore((s) => s.data.comments);
  const assignees = useStore((s) => s.data.task_assignees);
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null);
  const key = `${scope.workspaceId ?? ""}|${scope.projectId ?? ""}|${scope.taskId ?? ""}`;
  useEffect(() => {
    if (!adapter || !enabled || key === "||") return;
    let alive = true;
    const [workspaceId, projectId, taskId] = key.split("|");
    const id = setTimeout(() => {
      adapter
        .loadActivity({ workspaceId: workspaceId || undefined, projectId: projectId || undefined, taskId: taskId || undefined }, limit)
        .then((e) => alive && setEntries(e))
        .catch(() => alive && setEntries([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(id);
    };
  }, [adapter, key, limit, enabled, log, tasks, projects, comments, assignees]);
  return entries;
}

/** Open tasks I created or follow that someone else is responsible for ("Boshqalardan kutilayotgan"). */
export function useDelegatedTasks(): Task[] {
  const tasks = useStore((s) => s.data.tasks);
  const assignees = useStore((s) => s.data.task_assignees);
  const watchers = useStore((s) => s.data.task_watchers);
  const uid = useUserId();
  return useMemo(() => {
    const by = assigneesByTask(assignees);
    const watched = new Set(Object.values(watchers).filter((w) => w.user_id === uid).map((w) => w.task_id));
    return liveTasks(tasks).filter((t) => !t.parent_id && isOpen(t) && isDelegatedBy(t, uid, by, watched.has(t.id)));
  }, [tasks, assignees, watchers, uid]);
}

// ------------------------------------------------------------------ organisation

export function useContacts(workspaceId?: string): Contact[] {
  const contacts = useStore((s) => s.data.contacts);
  return useMemo(
    () =>
      Object.values(contacts)
        .filter((c) => !c.deleted_at && (!workspaceId || c.workspace_id === workspaceId))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [contacts, workspaceId],
  );
}

export function useMeetings(): Meeting[] {
  const meetings = useStore((s) => s.data.meetings);
  return useMemo(() => Object.values(meetings).filter((m) => !m.deleted_at).sort((a, b) => a.starts_at.localeCompare(b.starts_at)), [meetings]);
}

export function useRoutines(): Routine[] {
  const routines = useStore((s) => s.data.routines);
  return useMemo(() => Object.values(routines).filter((r) => !r.archived_at).sort((a, b) => a.position - b.position || a.name.localeCompare(b.name)), [routines]);
}
