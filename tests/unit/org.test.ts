import { describe, expect, it } from "vitest";
import {
  carryOver,
  defaultFollowUp,
  followUpDue,
  nextMeetingStart,
  partnerMeetingStart,
  routineDueOn,
  runProgress,
  shutdownDue,
  toggleRunItem,
  unfinishedToday,
  waitingDays,
  waitingOn,
  waitingTasks,
  weekNumbers,
} from "@/lib/org";
import type { Task } from "@/lib/types";

const TZ = "Asia/Tashkent";
const task = (p: Partial<Task>): Task =>
  ({
    id: Math.random().toString(36), workspace_id: "w", project_id: null, section_id: null, parent_id: null, title: "t",
    description: null, status: "todo", priority: "none", start_date: null, due_date: null, due_at: null, deadline: null,
    estimate_min: null, recurrence: null, recurrence_parent_id: null, top_date: null, position: 0, completed_at: null,
    created_by: "u", source: null, waiting_on_user_id: null, waiting_on_contact_id: null, waiting_since: null, follow_up_date: null, energy: null,
    created_at: "", updated_at: "", deleted_at: null, ...p,
  }) as Task;

describe("waiting-for", () => {
  it("prefers the contact and counts days since", () => {
    expect(waitingOn(task({ waiting_on_user_id: "u2", waiting_on_contact_id: "c1" }))).toEqual({ kind: "contact", id: "c1" });
    expect(waitingOn(task({ waiting_on_user_id: "u2" }))).toEqual({ kind: "user", id: "u2" });
    expect(waitingOn(task({}))).toBeNull();
    expect(waitingDays(task({ waiting_since: "2026-10-01" }), "2026-10-06")).toBe(5);
  });
  it("follow-up is three days out and never on a Sunday", () => {
    expect(defaultFollowUp("2026-10-05")).toBe("2026-10-08"); // Mon → Thu
    expect(defaultFollowUp("2026-10-08")).toBe("2026-10-12"); // Thu → Sun → Mon
  });
  it("follow-up is due on and after its date, only while open", () => {
    expect(followUpDue(task({ follow_up_date: "2026-10-06" }), "2026-10-06")).toBe(true);
    expect(followUpDue(task({ follow_up_date: "2026-10-07" }), "2026-10-06")).toBe(false);
    expect(followUpDue(task({ follow_up_date: "2026-10-01", status: "done" }), "2026-10-06")).toBe(false);
  });
  it("lists open waiting tasks oldest first", () => {
    const a = task({ title: "a", waiting_on_user_id: "u2", waiting_since: "2026-10-03" });
    const b = task({ title: "b", waiting_on_contact_id: "c", waiting_since: "2026-10-01" });
    const c = task({ title: "c", waiting_on_contact_id: "c", status: "done" });
    expect(waitingTasks([a, b, c, task({})]).map((t) => t.title)).toEqual(["b", "a"]);
  });
});

describe("meetings", () => {
  it("the partner meeting is the coming Friday 19:30 local", () => {
    // Tue 6 Oct 2026, 12:00 in Tashkent
    expect(partnerMeetingStart(TZ, new Date("2026-10-06T07:00:00Z"))).toBe("2026-10-09T14:30:00.000Z");
    // Friday after 19:30 → next week
    expect(partnerMeetingStart(TZ, new Date("2026-10-09T15:00:00Z"))).toBe("2026-10-16T14:30:00.000Z");
  });
  it("the next meeting of a weekly series keeps the local time", () => {
    expect(nextMeetingStart("FREQ=WEEKLY;BYDAY=FR", "2026-10-09T14:30:00.000Z", TZ)).toBe("2026-10-16T14:30:00.000Z");
    expect(nextMeetingStart("nonsense", "2026-10-09T14:30:00.000Z", TZ)).toBeNull();
  });
  it("open agenda points carry over, decisions and done points don't", () => {
    expect(
      carryOver([
        { kind: "agenda", text: "B", done: false, position: 2 },
        { kind: "agenda", text: "A", done: false, position: 1 },
        { kind: "agenda", text: "done", done: true, position: 0 },
        { kind: "decision", text: "D", done: false, position: 3 },
      ]),
    ).toEqual(["A", "B"]);
  });
  it("week numbers count completions in the week and current overdue", () => {
    const tasks = [
      task({ status: "done", completed_at: "2026-09-30T08:00:00Z" }),
      task({ status: "done", completed_at: "2026-10-06T08:00:00Z" }),
      task({ due_date: "2026-10-01" }),
    ];
    const entries = [{ minutes: 30, started_at: "2026-09-29T08:00:00Z", user_id: "u" }, { minutes: 15, started_at: "2026-09-29T09:00:00Z", user_id: "v" }];
    expect(weekNumbers(tasks, entries, "2026-09-28", "2026-10-06", TZ)).toEqual({ done: 1, overdue: 1, minutes: 45 });
    expect(weekNumbers(tasks, entries, "2026-09-28", "2026-10-06", TZ, "u").minutes).toBe(30);
  });
});

describe("routines", () => {
  const r = { recurrence: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", created_at: "2026-10-01T05:00:00Z", items: [{ id: "a", text: "A" }, { id: "b", text: "B" }] };
  it("runs on its days, from the day it was created", () => {
    expect(routineDueOn(r, "2026-10-06", TZ)).toBe(true); // Tue
    expect(routineDueOn(r, "2026-10-04", TZ)).toBe(false); // Sun
    expect(routineDueOn(r, "2026-09-29", TZ)).toBe(false); // before it existed
    expect(routineDueOn({ ...r, recurrence: "FREQ=MONTHLY" }, "2026-11-01", TZ)).toBe(true);
    expect(routineDueOn({ ...r, recurrence: "FREQ=MONTHLY" }, "2026-11-02", TZ)).toBe(false);
  });
  it("progress and completion", () => {
    expect(runProgress(r, { checked: ["a", "gone"] })).toEqual({ done: 1, total: 2 });
    expect(toggleRunItem(r, ["a"], "b")).toEqual({ checked: ["a", "b"], complete: true });
    expect(toggleRunItem(r, ["a", "b"], "b")).toEqual({ checked: ["a"], complete: false });
  });
});

describe("daily shutdown", () => {
  it("unfinished today: due today or earlier, or in today's top 3", () => {
    const list = [task({ title: "due", due_date: "2026-10-06" }), task({ title: "top", top_date: "2026-10-06" }), task({ title: "later", due_date: "2026-10-07" }), task({ title: "done", due_date: "2026-10-06", status: "done" })];
    expect(unfinishedToday(list, "2026-10-06").map((t) => t.title)).toEqual(["due", "top"]);
  });
  it("is due after the chosen time, once", () => {
    const p = { shutdown_enabled: true, shutdown_time: "18:30:00" };
    expect(shutdownDue(p, "18:29", false)).toBe(false);
    expect(shutdownDue(p, "18:30", false)).toBe(true);
    expect(shutdownDue(p, "19:00", true)).toBe(false);
    expect(shutdownDue({ ...p, shutdown_enabled: false }, "19:00", false)).toBe(false);
  });
});
