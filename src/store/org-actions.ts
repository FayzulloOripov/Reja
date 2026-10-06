"use client";

// Organisation actions: contacts, waiting-for, meetings, weekly review, daily shutdown, routines.
// Optimistic like the rest of the store; destructive ones offer an undo.

import { showUndo } from "@/components/common/undo-toast";
import { addDays, todayIn, zonedToUtc } from "@/lib/dates";
import { tr } from "@/lib/i18n-client";
import { carryOver, nextMeetingStart, toggleRunItem, type WaitingOn } from "@/lib/org";
import type {
  Contact,
  DailyShutdownData,
  Meeting,
  MeetingItem,
  Routine,
  Task,
  WeeklyReviewData,
} from "@/lib/types";
import { createTask } from "./actions";
import {
  newContact,
  newDailyShutdown,
  newMeeting,
  newMeetingAttendee,
  newMeetingItem,
  newReminder,
  newRoutine,
  newRoutineRun,
  newWeeklyReview,
  uuid,
} from "./factories";
import { mutate, useStore, type MutationInput } from "./store";

const S = () => useStore.getState();
const uid = () => S().userId ?? "";
const me = () => S().data.profiles[uid()];
const tz = () => me()?.timezone || "Asia/Tashkent";
const today = () => todayIn(tz());
const nowIso = () => new Date().toISOString();
const undo = (message: string, inverse: MutationInput[]) => showUndo(message, () => mutate(inverse));

// ------------------------------------------------------------------ contacts

export function createContact(input: { workspaceId: string; name: string; phone?: string; company?: string; telegram?: string; note?: string }): Contact {
  const c = newContact({
    workspace_id: input.workspaceId,
    name: input.name.trim(),
    phone: input.phone?.trim() || null,
    company: input.company?.trim() || null,
    telegram: input.telegram?.trim().replace(/^@/, "") || null,
    note: input.note?.trim() || null,
    created_by: uid(),
  });
  mutate([{ table: "contacts", kind: "insert", row: c }]);
  return c;
}

export function updateContact(id: string, values: Partial<Contact>) {
  mutate([{ table: "contacts", kind: "update", row: { id }, values }]);
}

/** Deleting a contact stops the tasks waiting on them from pointing at a ghost. */
export function deleteContact(contact: Contact) {
  const ops: MutationInput[] = Object.values(S().data.tasks)
    .filter((t) => t.waiting_on_contact_id === contact.id)
    .map((t) => ({ table: "tasks" as const, kind: "update" as const, row: { id: t.id }, values: { waiting_on_contact_id: null } }));
  ops.push({ table: "contacts", kind: "update", row: { id: contact.id }, values: { deleted_at: nowIso() } });
  undo(tr("common.deleted"), mutate(ops));
}

// ------------------------------------------------------------------ waiting-for

/** The moment a follow-up reminder fires: the start of the working day. */
function followUpMoment(date: string): string {
  return zonedToUtc(date, (me()?.work_start ?? "10:00").slice(0, 5), tz()).toISOString();
}

function followUpReminderOps(task: Task, oldDate: string | null, newDate: string | null): MutationInput[] {
  const ops: MutationInput[] = [];
  if (oldDate) {
    const at = followUpMoment(oldDate);
    for (const r of Object.values(S().data.reminders)) {
      if (r.task_id === task.id && r.offset_rule === "custom" && r.user_id === uid() && r.status === "pending" && new Date(r.remind_at).toISOString() === at) {
        ops.push({ table: "reminders", kind: "update", row: { id: r.id }, values: { status: "dismissed" } });
      }
    }
  }
  if (newDate && newDate >= today()) {
    ops.push({
      table: "reminders",
      kind: "insert",
      row: newReminder({ user_id: uid(), task_id: task.id, workspace_id: task.workspace_id, remind_at: followUpMoment(newDate), offset_rule: "custom", title: tr("waiting.followUpTitle", { title: task.title }) }),
    });
  }
  return ops;
}

/** Mark a task as waiting on a teammate or contact (or clear it), with a follow-up reminder. */
export function setWaiting(task: Task, on: WaitingOn | null, followUp: string | null = null) {
  if (!on) {
    const values: Partial<Task> = { waiting_on_user_id: null, waiting_on_contact_id: null, waiting_since: null, follow_up_date: null };
    if (task.status === "waiting") values.status = "todo";
    mutate([{ table: "tasks", kind: "update", row: { id: task.id }, values }, ...followUpReminderOps(task, task.follow_up_date, null)]);
    return;
  }
  const values: Partial<Task> = {
    waiting_on_user_id: on.kind === "user" ? on.id : null,
    waiting_on_contact_id: on.kind === "contact" ? on.id : null,
    waiting_since: task.waiting_since ?? today(),
    follow_up_date: followUp,
  };
  if (task.status === "todo" || task.status === "in_progress") values.status = "waiting";
  const ops: MutationInput[] = [{ table: "tasks", kind: "update", row: { id: task.id }, values }];
  if (followUp !== task.follow_up_date) ops.push(...followUpReminderOps(task, task.follow_up_date, followUp));
  mutate(ops);
}

export function setFollowUp(task: Task, date: string | null) {
  mutate([{ table: "tasks", kind: "update", row: { id: task.id }, values: { follow_up_date: date } }, ...followUpReminderOps(task, task.follow_up_date, date)]);
}

/** «Chased them»: push the follow-up a few days out. */
export function snoozeFollowUp(task: Task, days = 3) {
  setFollowUp(task, addDays(today(), days));
}

// ------------------------------------------------------------------ meetings

export interface MeetingInput {
  workspaceId: string;
  title: string;
  startsAt: string;
  durationMin?: number;
  projectId?: string | null;
  location?: string | null;
  recurrence?: string | null;
  templateKey?: string | null;
  userIds?: string[];
  contactIds?: string[];
  agenda?: string[];
  seriesId?: string | null;
}

function meetingOps(input: MeetingInput): { meeting: Meeting; ops: MutationInput[] } {
  const id = uuid();
  const meeting = newMeeting({
    id,
    workspace_id: input.workspaceId,
    title: input.title.trim(),
    starts_at: input.startsAt,
    duration_min: input.durationMin ?? 60,
    project_id: input.projectId ?? null,
    location: input.location?.trim() || null,
    recurrence: input.recurrence ?? null,
    template_key: input.templateKey ?? null,
    series_id: input.recurrence ? (input.seriesId ?? id) : null,
    created_by: uid(),
  });
  const ops: MutationInput[] = [{ table: "meetings", kind: "insert", row: meeting }];
  for (const user_id of new Set(input.userIds ?? [])) {
    ops.push({ table: "meeting_attendees", kind: "insert", row: newMeetingAttendee({ meeting_id: id, workspace_id: input.workspaceId, user_id }) });
  }
  for (const contact_id of new Set(input.contactIds ?? [])) {
    ops.push({ table: "meeting_attendees", kind: "insert", row: newMeetingAttendee({ meeting_id: id, workspace_id: input.workspaceId, contact_id }) });
  }
  const base = Date.now();
  (input.agenda ?? []).forEach((text, i) => {
    ops.push({ table: "meeting_items", kind: "insert", row: newMeetingItem({ meeting_id: id, workspace_id: input.workspaceId, kind: "agenda", text, position: base + i, created_by: uid() }) });
  });
  return { meeting, ops };
}

export function createMeeting(input: MeetingInput): Meeting {
  const { meeting, ops } = meetingOps(input);
  mutate(ops);
  return meeting;
}

export function updateMeeting(id: string, values: Partial<Meeting>) {
  mutate([{ table: "meetings", kind: "update", row: { id }, values }]);
}

export function deleteMeeting(meeting: Meeting) {
  undo(tr("common.deleted"), mutate([{ table: "meetings", kind: "update", row: { id: meeting.id }, values: { deleted_at: nowIso() } }]));
}

export function toggleAttendee(meeting: Meeting, who: WaitingOn, on: boolean) {
  const existing = Object.values(S().data.meeting_attendees).find(
    (a) => a.meeting_id === meeting.id && (who.kind === "user" ? a.user_id === who.id : a.contact_id === who.id),
  );
  if (on && !existing) {
    mutate([
      {
        table: "meeting_attendees",
        kind: "insert",
        row: newMeetingAttendee({ meeting_id: meeting.id, workspace_id: meeting.workspace_id, user_id: who.kind === "user" ? who.id : null, contact_id: who.kind === "contact" ? who.id : null }),
      },
    ]);
  } else if (!on && existing) {
    mutate([{ table: "meeting_attendees", kind: "delete", row: { id: existing.id } }]);
  }
}

export function addMeetingItem(meeting: Meeting, kind: MeetingItem["kind"], text: string): MeetingItem {
  const item = newMeetingItem({ meeting_id: meeting.id, workspace_id: meeting.workspace_id, kind, text: text.trim(), created_by: uid() });
  mutate([{ table: "meeting_items", kind: "insert", row: item }]);
  return item;
}

export function updateMeetingItem(id: string, values: Partial<MeetingItem>) {
  mutate([{ table: "meeting_items", kind: "update", row: { id }, values }]);
}

export function deleteMeetingItem(id: string) {
  undo(tr("common.deleted"), mutate([{ table: "meeting_items", kind: "delete", row: { id } }]));
}

/** A decision becomes a task in the meeting's project (or the inbox), linked back to the item. */
export function decisionToTask(meeting: Meeting, item: MeetingItem, opts: { assigneeId?: string | null; dueDate?: string | null } = {}): Task {
  const task = createTask({
    title: item.text,
    workspaceId: meeting.workspace_id,
    projectId: meeting.project_id,
    dueDate: opts.dueDate ?? null,
    assigneeIds: opts.assigneeId ? [opts.assigneeId] : [],
    source: "meeting",
  });
  mutate([{ table: "meeting_items", kind: "update", row: { id: item.id }, values: { task_id: task.id } }]);
  return task;
}

/**
 * Finish a meeting. In a recurring series the next meeting is created (once) with the same
 * attendees, and agenda points nobody got to move to it.
 */
export function finishMeeting(meeting: Meeting): Meeting | null {
  const d = S().data;
  const ops: MutationInput[] = [{ table: "meetings", kind: "update", row: { id: meeting.id }, values: { finished_at: nowIso() } }];
  let next: Meeting | null = null;
  if (meeting.recurrence && meeting.series_id) {
    const startsAt = nextMeetingStart(meeting.recurrence, meeting.starts_at, tz());
    const exists = Object.values(d.meetings).some((m) => m.series_id === meeting.series_id && !m.deleted_at && m.starts_at > meeting.starts_at);
    if (startsAt && !exists) {
      const attendees = Object.values(d.meeting_attendees).filter((a) => a.meeting_id === meeting.id);
      const items = Object.values(d.meeting_items).filter((i) => i.meeting_id === meeting.id);
      const built = meetingOps({
        workspaceId: meeting.workspace_id,
        title: meeting.title,
        startsAt,
        durationMin: meeting.duration_min,
        projectId: meeting.project_id,
        location: meeting.location,
        recurrence: meeting.recurrence,
        templateKey: meeting.template_key,
        seriesId: meeting.series_id,
        userIds: attendees.flatMap((a) => (a.user_id ? [a.user_id] : [])),
        contactIds: attendees.flatMap((a) => (a.contact_id ? [a.contact_id] : [])),
        agenda: carryOver(items),
      });
      next = built.meeting;
      ops.push(...built.ops);
    }
  }
  undo(tr("meetings.finished"), mutate(ops));
  return next;
}

export function reopenMeeting(meeting: Meeting) {
  mutate([{ table: "meetings", kind: "update", row: { id: meeting.id }, values: { finished_at: null } }]);
}

// ------------------------------------------------------------------ weekly review & daily shutdown

export function saveReview(weekStart: string, data: WeeklyReviewData, complete = false) {
  const existing = Object.values(S().data.weekly_reviews).find((r) => r.user_id === uid() && r.week_start === weekStart);
  if (existing) {
    const values: Record<string, unknown> = { data: { ...existing.data, ...data } };
    if (complete) values.completed_at = nowIso();
    mutate([{ table: "weekly_reviews", kind: "update", row: { id: existing.id }, values }]);
  } else {
    mutate([{ table: "weekly_reviews", kind: "insert", row: newWeeklyReview({ user_id: uid(), week_start: weekStart, data, completed_at: complete ? nowIso() : null }) }]);
  }
}

export function saveShutdown(date: string, data: DailyShutdownData, complete = false) {
  const existing = Object.values(S().data.daily_shutdowns).find((r) => r.user_id === uid() && r.date === date);
  if (existing) {
    const values: Record<string, unknown> = { data: { ...existing.data, ...data } };
    if (complete) values.completed_at = nowIso();
    mutate([{ table: "daily_shutdowns", kind: "update", row: { id: existing.id }, values }]);
  } else {
    mutate([{ table: "daily_shutdowns", kind: "insert", row: newDailyShutdown({ user_id: uid(), date, data, completed_at: complete ? nowIso() : null }) }]);
  }
}

/** Shutdown: today's leftovers move to tomorrow, and drop out of today's top 3. */
export function moveLeftoversToTomorrow(tasks: Task[]) {
  const t0 = today();
  const tomorrow = addDays(t0, 1);
  const ops: MutationInput[] = tasks.map((task) => {
    const values: Partial<Task> = {};
    if (task.due_date && task.due_date <= t0) {
      values.due_date = tomorrow;
      if (task.due_at) values.due_at = new Date(new Date(task.due_at).getTime() + (Date.parse(tomorrow) - Date.parse(task.due_date)) ).toISOString();
      if (task.start_date && task.start_date > tomorrow) values.start_date = tomorrow;
    }
    if (task.top_date === t0) values.top_date = null;
    return { table: "tasks" as const, kind: "update" as const, row: { id: task.id }, values };
  });
  undo(tr("task.bulkRescheduled", { count: tasks.length }), mutate(ops));
}

/** Shutdown, one task at a time: tomorrow, later (next Monday, off the dates) or drop it. */
export function triageLeftover(task: Task, choice: "tomorrow" | "later" | "drop") {
  if (choice === "tomorrow") return moveLeftoversToTomorrow([task]);
  const t0 = today();
  const values: Partial<Task> =
    choice === "drop"
      ? { status: "cancelled", top_date: task.top_date === t0 ? null : task.top_date }
      : { due_date: nextMonday(t0), due_at: null, top_date: task.top_date === t0 ? null : task.top_date };
  undo(choice === "drop" ? tr("shutdown.dropped") : tr("shutdown.movedLater"), mutate([{ table: "tasks", kind: "update", row: { id: task.id }, values }]));
}

function nextMonday(from: string): string {
  const dow = new Date(from + "T00:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(from, ((8 - dow) % 7) || 7);
}

// ------------------------------------------------------------------ routines

export function createRoutine(input: { workspaceId: string; name: string; items: string[]; recurrence: string; visibility?: Routine["visibility"]; color?: string }): Routine {
  const r = newRoutine({
    workspace_id: input.workspaceId,
    owner_id: uid(),
    name: input.name.trim(),
    items: input.items.map((text) => text.trim()).filter(Boolean).map((text) => ({ id: uuid(), text })),
    recurrence: input.recurrence,
    visibility: input.visibility ?? "private",
    color: input.color ?? "teal",
  });
  mutate([{ table: "routines", kind: "insert", row: r }]);
  return r;
}

export function updateRoutine(id: string, values: Partial<Routine>) {
  mutate([{ table: "routines", kind: "update", row: { id }, values }]);
}

export function archiveRoutine(routine: Routine) {
  undo(tr("routines.archived"), mutate([{ table: "routines", kind: "update", row: { id: routine.id }, values: { archived_at: nowIso() } }]));
}

/** Tick an item of a routine for a day; the day's run is created on the first tick. */
export function toggleRoutineItem(routine: Routine, date: string, itemId: string) {
  const run = Object.values(S().data.routine_runs).find((r) => r.routine_id === routine.id && r.date === date);
  const { checked, complete } = toggleRunItem(routine, run?.checked ?? [], itemId);
  if (!run) {
    mutate([{ table: "routine_runs", kind: "insert", row: newRoutineRun({ routine_id: routine.id, workspace_id: routine.workspace_id, user_id: uid(), date, checked, completed_at: complete ? nowIso() : null }) }]);
  } else {
    mutate([{ table: "routine_runs", kind: "update", row: { id: run.id }, values: { checked, completed_at: complete ? (run.completed_at ?? nowIso()) : null } }]);
  }
}
