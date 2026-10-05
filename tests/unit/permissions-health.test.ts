import { describe, expect, it } from "vitest";
import { suggestHealth } from "@/lib/health";
import { canWrite, projectAccess, taskAccess } from "@/lib/permissions";

const project = { id: "p", workspace_id: "w", visibility: "workspace" as const, owner_id: "owner" };

describe("projectAccess (mirrors RLS)", () => {
  it("grants by workspace role on workspace projects", () => {
    expect(projectAccess("a", project, "admin", null)).toBe("manage");
    expect(projectAccess("m", project, "member", null)).toBe("write");
    expect(projectAccess("g", project, "guest", null)).toBeNull();
    expect(projectAccess("x", project, null, null)).toBeNull();
  });

  it("grants by project role for guests", () => {
    expect(projectAccess("g", project, "guest", "manager")).toBe("manage");
    expect(projectAccess("g", project, "guest", "member")).toBe("write");
    expect(projectAccess("g", project, "guest", "viewer")).toBe("read");
    expect(canWrite(projectAccess("g", project, "guest", "viewer"))).toBe(false);
  });

  it("hides private projects from workspace members who were not invited", () => {
    const priv = { ...project, visibility: "private" as const };
    expect(projectAccess("m", priv, "member", null)).toBeNull();
    expect(projectAccess("a", priv, "admin", null)).toBeNull();
    expect(projectAccess("owner", priv, "owner", null)).toBe("manage");
    expect(projectAccess("m", priv, "member", "viewer")).toBe("read");
  });

  it("keeps inbox tasks private to their creator", () => {
    const members = { ws: [], pm: [] };
    expect(taskAccess("me", { project_id: null, created_by: "me" }, undefined, members)).toBe("manage");
    expect(taskAccess("other", { project_id: null, created_by: "me" }, undefined, members)).toBeNull();
  });
});

describe("suggestHealth", () => {
  const today = "2026-10-05";
  const t = (status: string, due: string | null = null) => ({ status: status as "todo", due_date: due, deadline: null, parent_id: null, deleted_at: null });

  it("is off track after the target date", () => {
    expect(suggestHealth({ target_date: "2026-10-01", status: "active" }, [t("todo")], today).health).toBe("off_track");
  });

  it("is at risk when more than 20% of open tasks are overdue", () => {
    const r = suggestHealth({ target_date: null, status: "active" }, [t("todo", "2026-10-01"), t("todo"), t("todo"), t("done")], today);
    expect(r.health).toBe("at_risk");
    expect(r.reason).toEqual({ key: "reasonOverdue", percent: 33 });
  });

  it("is at risk close to the target with under 70% done", () => {
    const tasks = [t("done"), t("todo"), t("todo")];
    expect(suggestHealth({ target_date: "2026-10-10", status: "active" }, tasks, today).health).toBe("at_risk");
    expect(suggestHealth({ target_date: "2026-10-20", status: "active" }, tasks, today).health).toBe("on_track");
  });

  it("is on track when exactly 20% are overdue", () => {
    const tasks = [t("todo", "2026-10-01"), t("todo"), t("todo"), t("todo"), t("todo")];
    expect(suggestHealth({ target_date: null, status: "active" }, tasks, today).health).toBe("on_track");
  });
});
