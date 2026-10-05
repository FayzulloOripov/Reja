// Client-side mirror of the RLS rules in 20261005000002_functions.sql (project_access).
// Used only to hide controls a user cannot use; the database is the real authority.

import type { Project, ProjectMember, ProjectRole, Task, WorkspaceMember, WorkspaceRole } from "./types";

export type Access = "manage" | "write" | "read" | null;

export function projectAccess(
  userId: string,
  project: Pick<Project, "id" | "workspace_id" | "visibility" | "owner_id">,
  wsRole: WorkspaceRole | null | undefined,
  pmRole: ProjectRole | null | undefined,
): Access {
  if (!wsRole) return null;
  if (project.owner_id === userId) return "manage";
  if (pmRole === "manager") return "manage";
  if (project.visibility === "workspace" && (wsRole === "owner" || wsRole === "admin")) return "manage";
  if (pmRole === "member") return "write";
  if (project.visibility === "workspace" && wsRole === "member") return "write";
  if (pmRole === "viewer") return "read";
  return null;
}

export function canWrite(a: Access) {
  return a === "write" || a === "manage";
}

export function canManage(a: Access) {
  return a === "manage";
}

export function taskAccess(
  userId: string,
  task: Pick<Task, "project_id" | "created_by">,
  project: Pick<Project, "id" | "workspace_id" | "visibility" | "owner_id"> | undefined,
  members: { ws: WorkspaceMember[]; pm: ProjectMember[] },
): Access {
  if (!task.project_id) return task.created_by === userId ? "manage" : null;
  if (!project) return null;
  const ws = members.ws.find((m) => m.workspace_id === project.workspace_id && m.user_id === userId)?.role;
  const pm = members.pm.find((m) => m.project_id === project.id && m.user_id === userId)?.role;
  return projectAccess(userId, project, ws, pm);
}

export function isFullMember(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin" || role === "member";
}

export function isWorkspaceAdmin(role: WorkspaceRole | null | undefined) {
  return role === "owner" || role === "admin";
}
