// Clearly fake demo data, used by demo mode (NEXT_PUBLIC_DEMO_MODE) and `npm run seed:demo`.
// Every person and company here is invented; names end with "(demo)" where they could be mistaken.

import { addDays, addMonths, startOfMonth, startOfWeek, zonedToUtc } from "../dates";
import type {
  ActivityEntry,
  Area,
  Comment,
  ChecklistItem,
  Goal,
  Habit,
  HabitLog,
  KeyResult,
  KeyResultHistory,
  Label,
  Note,
  Notification,
  Profile,
  Project,
  ProjectMember,
  Section,
  Task,
  TaskAssignee,
  TaskLabel,
  TimeBlock,
  TimeEntry,
  Workspace,
  WorkspaceMember,
} from "../types";

export const DEMO_USER_ID = "00000000-0000-4000-8000-000000000001";
const PARTNER = "00000000-0000-4000-8000-000000000002";
const GUEST = "00000000-0000-4000-8000-000000000003";

export interface DemoData {
  profiles: Profile[];
  comments: Comment[];
  activity_log: ActivityEntry[];
  areas: Area[];
  workspaces: Workspace[];
  workspace_members: WorkspaceMember[];
  projects: Project[];
  project_members: ProjectMember[];
  sections: Section[];
  tasks: Task[];
  task_assignees: TaskAssignee[];
  labels: Label[];
  task_labels: TaskLabel[];
  checklist_items: ChecklistItem[];
  habits: Habit[];
  habit_logs: HabitLog[];
  goals: Goal[];
  key_results: KeyResult[];
  key_result_history: KeyResultHistory[];
  notes: Note[];
  time_blocks: TimeBlock[];
  time_entries: TimeEntry[];
  notifications: Notification[];
}

function seededId(n: number): string {
  return `00000000-0000-4000-9000-${String(n).padStart(12, "0")}`;
}

export function buildDemoData(userId: string, today: string, tz = "Asia/Tashkent", lang: "uz" | "en" = "uz"): DemoData {
  const uz = lang === "uz";
  let n = 100;
  const id = () => seededId(n++);
  const ts = new Date().toISOString();
  const stamp = { created_at: ts, updated_at: ts };

  const profile = (pid: string, name: string, email: string): Profile => ({
    id: pid,
    email,
    name,
    avatar_url: null,
    timezone: tz,
    language: lang,
    theme: "system",
    work_days: [1, 2, 3, 4, 5, 6],
    quiet_enabled: true,
    quiet_start: "22:00:00",
    quiet_end: "07:00:00",
    digest_enabled: true,
    digest_time: "07:30:00",
    review_enabled: true,
    review_dow: 7,
    review_time: "09:00:00",
    overdue_nudge_enabled: true,
    default_reminder: "15m",
    notify_prefs: {
      in_app: { assigned: true, mentioned: true, comment: true, status_change: true, invite: true, reminder: true, due_soon: true, overdue: true },
      telegram: { assigned: true, mentioned: true, reminder: true, digest: true, review: true, overdue: true },
      push: { assigned: true, mentioned: true, comment: true, reminder: true },
      email: { mentioned: true, invite: true },
    },
    telegram_chat_id: null,
    telegram_username: null,
    ics_token: "demo-token",
    onboarded_at: ts,
    current_workspace_id: null,
    work_start: "10:00:00",
    work_end: "19:00:00",
    day_start: "07:00:00",
    day_end: "22:00:00",
    daily_capacity_tasks: null,
    daily_capacity_minutes: null,
    pomodoro_work: 25,
    pomodoro_break: 5,
    last_digest_on: null,
    last_review_on: null,
    last_overdue_nudge_on: null,
    ...stamp,
  });

  const me = profile(userId, uz ? "Demo foydalanuvchi" : "Demo User", "demo@example.test");
  const partner = profile(PARTNER, uz ? "Hamkor (demo)" : "Partner (demo)", "partner@example.test");
  const guest = profile(GUEST, uz ? "Konsultant (demo)" : "Consultant (demo)", "consultant@example.test");

  const wsPersonal: Workspace = { id: id(), name: uz ? "Shaxsiy" : "Personal", icon: "sparkles", color: "tangerine", owner_id: userId, is_personal: true, deleted_at: null, ...stamp };
  const wsTeam: Workspace = { id: id(), name: uz ? "Demo agentlik" : "Demo Agency", icon: "briefcase", color: "indigo", owner_id: userId, is_personal: false, deleted_at: null, ...stamp };
  me.current_workspace_id = wsTeam.id;

  const members: WorkspaceMember[] = [
    { workspace_id: wsPersonal.id, user_id: userId, role: "owner", created_at: ts },
    { workspace_id: wsTeam.id, user_id: userId, role: "owner", created_at: ts },
    { workspace_id: wsTeam.id, user_id: PARTNER, role: "member", created_at: ts },
    { workspace_id: wsTeam.id, user_id: GUEST, role: "guest", created_at: ts },
  ];

  const proj = (ws: string, name: string, color: string, extra: Partial<Project> = {}): Project => ({
    id: id(),
    workspace_id: ws,
    name,
    description: null,
    color,
    icon: null,
    area: null,
    status: "active",
    visibility: "workspace",
    start_date: addDays(today, -21),
    target_date: null,
    goal: null,
    health: null,
    health_manual: false,
    health_note: null,
    area_id: null,
    owner_id: userId,
    position: n,
    share_token: null,
    telegram_chat_id: null,
    telegram_link_code: null,
    deleted_at: null,
    ...stamp,
    ...extra,
  });

  const area = (ws: string, name: string, color: string, pos: number): Area => ({
    id: id(),
    workspace_id: ws,
    name,
    color,
    icon: null,
    visibility: "workspace",
    owner_id: userId,
    position: pos,
    archived_at: null,
    deleted_at: null,
    ...stamp,
  });
  const aJob = area(wsTeam.id, uz ? "Asosiy ish (demo)" : "Day job (demo)", "tangerine", 1);
  const aAgency = area(wsTeam.id, uz ? "Agentlik" : "Agency", "indigo", 2);
  const aPersonal = area(wsPersonal.id, uz ? "Shaxsiy" : "Personal", "rose", 3);
  const areas = [aJob, aAgency, aPersonal];

  const pSales = proj(wsTeam.id, uz ? "Sotuv boʻlimi (demo)" : "Sales team (demo)", "tangerine", {
    area_id: aJob.id,
    goal: uz ? "Oylik reja: 120 mln soʻm tushum" : "Monthly plan: 120M revenue",
    target_date: addDays(today, 26),
  });
  const pAgency = proj(wsTeam.id, uz ? "Agentlik mijozlari" : "Agency clients", "indigo", {
    area_id: aAgency.id,
    goal: uz ? "3 ta yangi mijoz bilan shartnoma" : "Sign 3 new clients",
    target_date: addDays(today, 5),
  });
  const pClinic = proj(wsTeam.id, uz ? "Demo klinika" : "Demo clinic", "emerald", { area_id: aAgency.id });
  const pHome = proj(wsPersonal.id, uz ? "Uy va oila" : "Home & family", "rose", { area_id: aPersonal.id });
  const pHealth = proj(wsPersonal.id, uz ? "Sogʻliq" : "Health", "lime", { visibility: "private", area_id: aPersonal.id });
  const projects = [pSales, pAgency, pClinic, pHome, pHealth];

  const project_members: ProjectMember[] = [{ project_id: pClinic.id, user_id: GUEST, workspace_id: wsTeam.id, role: "member", created_at: ts }];

  const section = (p: Project, name: string, pos: number): Section => ({ id: id(), workspace_id: p.workspace_id, project_id: p.id, name, position: pos, deleted_at: null, ...stamp });
  const sections = [
    section(pSales, uz ? "Rejalashtirilgan" : "Planned", 1),
    section(pSales, uz ? "Jarayonda" : "In progress", 2),
    section(pSales, uz ? "Tekshiruvda" : "Review", 3),
    section(pAgency, uz ? "Lidlar" : "Leads", 1),
    section(pAgency, uz ? "Taklif yuborildi" : "Proposal sent", 2),
    section(pAgency, uz ? "Shartnoma" : "Contract", 3),
  ];
  const [sPlanned, sDoing, sReview, sLeads, sProposal, sContract] = sections;

  const labels: Label[] = [
    { id: id(), workspace_id: wsTeam.id, name: uz ? "moliya" : "finance", color: "emerald", deleted_at: null, ...stamp },
    { id: id(), workspace_id: wsTeam.id, name: uz ? "qoʻngʻiroq" : "call", color: "sky", deleted_at: null, ...stamp },
    { id: id(), workspace_id: wsTeam.id, name: "CRM", color: "violet", deleted_at: null, ...stamp },
  ];

  const tasks: Task[] = [];
  const task_assignees: TaskAssignee[] = [];
  const task_labels: TaskLabel[] = [];
  const checklist_items: ChecklistItem[] = [];

  const t = (p: Project | null, title: string, extra: Partial<Task> = {}, opts: { assignee?: string; label?: Label; checklist?: string[] } = {}): Task => {
    const row: Task = {
      id: id(),
      workspace_id: p?.workspace_id ?? wsPersonal.id,
      project_id: p?.id ?? null,
      section_id: null,
      parent_id: null,
      title,
      description: null,
      status: "todo",
      priority: "none",
      start_date: null,
      due_date: null,
      due_at: null,
      deadline: null,
      estimate_min: null,
      recurrence: null,
      recurrence_parent_id: null,
      top_date: null,
      position: n,
      completed_at: null,
      created_by: userId,
      source: null,
      deleted_at: null,
      ...stamp,
      ...extra,
    };
    tasks.push(row);
    if (opts.assignee) task_assignees.push({ task_id: row.id, user_id: opts.assignee, workspace_id: row.workspace_id, created_at: ts });
    if (opts.label) task_labels.push({ task_id: row.id, label_id: opts.label.id, workspace_id: row.workspace_id, created_at: ts });
    opts.checklist?.forEach((text, i) =>
      checklist_items.push({ id: id(), task_id: row.id, workspace_id: row.workspace_id, text, done: i === 0, position: i, ...stamp }),
    );
    return row;
  };
  const at = (date: string, time: string) => zonedToUtc(date, time, tz).toISOString();

  // Today: three top tasks, a few more, one timed
  t(pSales, uz ? "Oylik hisobotni yakunlash va menejerga topshirish" : "Finish the monthly report for the manager", { due_date: today, priority: "high", top_date: today, section_id: sDoing.id, estimate_min: 60 }, { label: labels[0], checklist: uz ? ["Tushum jadvali", "KPI hisoblash", "Izoh yozish"] : ["Revenue sheet", "KPI calculation", "Write summary"] });
  t(pAgency, uz ? "Demo mijozga taklif PDF yuborish" : "Send the proposal PDF to the demo client", { due_date: today, due_at: at(today, "11:00"), priority: "urgent", top_date: today, section_id: sProposal.id }, { label: labels[1] });
  t(null, uz ? "Barcha ochiq ishlarni bir joyga yozib chiqish" : "Write down every open loop in one place", { due_date: today, priority: "medium", top_date: today, estimate_min: 20 });
  t(pSales, uz ? "Repslar bilan 15 daqiqalik yigʻilish" : "15-minute stand-up with reps", { due_date: today, due_at: at(today, "09:30"), recurrence: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR,SA", section_id: sPlanned.id });
  t(pClinic, uz ? "Yangi admin uchun qoʻllanmani tekshirish" : "Review the guide for the new admin", { due_date: today, priority: "low" }, { assignee: GUEST });
  t(pHome, uz ? "Oila bilan kechki ovqat" : "Family dinner", { due_date: today, due_at: at(today, "19:00") });

  // Overdue
  t(pSales, uz ? "Avgust tushumi farqini solishtirish" : "Reconcile the August revenue gap", { due_date: addDays(today, -3), priority: "high", section_id: sReview.id }, { label: labels[0] });
  t(pAgency, uz ? "Hamkorlik kelishuviga javob berish" : "Reply to the partnership agreement", { due_date: addDays(today, -1), priority: "medium", section_id: sLeads.id }, { assignee: PARTNER });

  // Upcoming
  t(pAgency, uz ? "Brend nomi va shartnoma shablonini kelishish" : "Agree on brand name and contract template", { due_date: addDays(today, 2), deadline: addDays(today, 5), priority: "high", section_id: sContract.id, start_date: addDays(today, -2) }, { assignee: PARTNER });
  t(pAgency, uz ? "Metod paketi rejasi" : "Method pack plan", { start_date: addDays(today, 1), due_date: addDays(today, 9), priority: "medium", section_id: sProposal.id });
  t(pSales, uz ? "Sotuv tizimi 2-qism: qoʻngʻiroq skriptlari" : "Sales system part 2: call scripts", { start_date: addDays(today, 3), due_date: addDays(today, 12), section_id: sPlanned.id }, { label: labels[2] });
  t(pSales, uz ? "Oktabr maqsadini menejer bilan kelishish" : "Agree on October target with the manager", { due_date: addDays(today, 1), priority: "high", section_id: sPlanned.id });
  t(pSales, uz ? "CRM texnik topshirigʻini CTO ga yuborish" : "Send the CRM spec to the CTO", { due_date: addDays(today, 4), section_id: sDoing.id, start_date: today }, { label: labels[2] });
  t(pClinic, uz ? "Kurslar va muolajalar qoʻllanmasi" : "Courses and treatments guide", { start_date: addDays(today, -5), due_date: addDays(today, 6), status: "in_progress" }, { assignee: GUEST });
  t(pHealth, uz ? "Sport zaliga yozilish" : "Sign up for the gym", { due_date: addDays(today, 3) });
  t(pHome, uz ? "Shaxsiy byudjet jadvali" : "Personal budget sheet", { due_date: addDays(today, 6) });
  t(pHealth, uz ? "Har kuni 8 stakan suv" : "8 glasses of water", { due_date: today, recurrence: "FREQ=DAILY" });

  // Someday / no date
  t(pAgency, uz ? "Voronka sahifasidagi narxlarni yangilash" : "Update prices on the funnel page", { priority: "low", section_id: sLeads.id });
  t(null, uz ? "Kiyim uslubi: asosiy garderob roʻyxati" : "Wardrobe basics list", {});

  // Done (this week and last week, for reports)
  const doneDays = [-1, -2, -2, -4, -6, -8, -9, -10, -13, -15, -18, -22];
  doneDays.forEach((d, i) => {
    const date = addDays(today, d);
    t(i % 2 ? pSales : pAgency, `${uz ? "Bajarilgan ish" : "Done task"} #${i + 1}`, {
      status: "done",
      due_date: addDays(date, i % 3 === 0 ? -1 : 0),
      completed_at: at(date, "15:00"),
      created_at: at(addDays(date, -4), "10:00"),
      section_id: i % 2 ? sReview.id : sContract.id,
    });
  });

  const habitStamp = { created_at: at(addDays(today, -60), "08:00"), updated_at: ts };
  const habits: Habit[] = [
    { id: id(), user_id: userId, name: uz ? "Sport" : "Workout", icon: "dumbbell", color: "lime", days: [1, 3, 5, 6], position: 1, archived_at: null, ...habitStamp },
    { id: id(), user_id: userId, name: uz ? "20 bet kitob" : "Read 20 pages", icon: "book", color: "violet", days: [1, 2, 3, 4, 5, 6, 7], position: 2, archived_at: null, ...habitStamp },
    { id: id(), user_id: userId, name: uz ? "Kunni rejalashtirish" : "Plan the day", icon: "sun", color: "amber", days: [1, 2, 3, 4, 5, 6], position: 3, archived_at: null, ...habitStamp },
  ];
  const habit_logs: HabitLog[] = [];
  for (let d = -60; d < 0; d++) {
    const date = addDays(today, d);
    habits.forEach((h, i) => {
      if ((d * 7 + i * 3) % 5 !== 0) habit_logs.push({ habit_id: h.id, user_id: userId, date, created_at: ts });
    });
  }

  const goal: Goal = { id: id(), workspace_id: wsTeam.id, project_id: pSales.id, title: uz ? "Oktabr: 120 mln soʻm tushum" : "October: 120M revenue", description: null, owner_id: userId, start_date: startOfMonth(today), target_date: addDays(startOfMonth(addMonths(today, 1)), -1), status: "active", color: "tangerine", deleted_at: null, ...stamp };
  const goal2: Goal = { id: id(), workspace_id: wsTeam.id, project_id: pAgency.id, title: uz ? "Agentlikni ishga tushirish" : "Launch the agency", description: null, owner_id: userId, start_date: addDays(today, -20), target_date: addDays(today, 40), status: "active", color: "indigo", deleted_at: null, ...stamp };
  const key_results: KeyResult[] = [
    { id: id(), goal_id: goal.id, workspace_id: wsTeam.id, title: uz ? "Tushum" : "Revenue", start_value: 0, target: 120, current: 54, unit: uz ? "mln soʻm" : "M", position: 1, ...stamp },
    { id: id(), goal_id: goal.id, workspace_id: wsTeam.id, title: uz ? "Konversiya" : "Conversion", start_value: 8, target: 15, current: 11, unit: "%", position: 2, ...stamp },
    { id: id(), goal_id: goal2.id, workspace_id: wsTeam.id, title: uz ? "Imzolangan mijozlar" : "Signed clients", start_value: 0, target: 3, current: 1, unit: uz ? "ta" : "", position: 1, ...stamp },
  ];
  const key_result_history: KeyResultHistory[] = [12, 25, 33, 41, 54].map((v, i) => ({
    id: id(),
    key_result_id: key_results[0].id,
    workspace_id: wsTeam.id,
    value: v,
    recorded_by: userId,
    recorded_at: at(addDays(today, -20 + i * 5), "18:00"),
  }));

  const notes: Note[] = [
    {
      id: id(),
      workspace_id: wsTeam.id,
      project_id: pAgency.id,
      title: uz ? "Mijoz bilan uchrashuv qaydlari" : "Client meeting notes",
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: uz ? "Asosiy savollar: byudjet, muddat, qaror qabul qiluvchi." : "Key questions: budget, timeline, decision maker." }] },
          { type: "bulletList", content: [
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: uz ? "Keyingi uchrashuv — payshanba" : "Next meeting — Thursday" }] }] },
            { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: uz ? "Taklifni 2 ta paket bilan yuborish" : "Send the proposal with two packages" }] }] },
          ] },
        ],
      },
      position: 1,
      created_by: userId,
      deleted_at: null,
      ...stamp,
    },
  ];

  const time_blocks: TimeBlock[] = [
    { id: id(), user_id: userId, date: today, start_at: at(today, "08:00"), end_at: at(today, "09:00"), task_id: null, title: uz ? "Agentlik ishlari" : "Agency work", color: "indigo", ...stamp },
    { id: id(), user_id: userId, date: today, start_at: at(today, "14:00"), end_at: at(today, "15:30"), task_id: tasks[0].id, title: null, color: null, ...stamp },
  ];

  const weekStart = startOfWeek(today);
  const time_entries: TimeEntry[] = [0, 1, 2, -5, -6].map((d, i) => ({
    id: id(),
    task_id: tasks[i % 4].id,
    workspace_id: tasks[i % 4].workspace_id,
    user_id: userId,
    started_at: at(addDays(weekStart, d), "10:00"),
    minutes: [25, 50, 25, 75, 25][i],
    note: null,
    source: "focus",
    created_at: ts,
  }));

  // the same events as the notifications below, so the feeds and the inbox agree
  const commentText = uz ? "Shartnoma shablonini qoʻshdim, koʻrib chiqing" : "Added the contract template, please review";
  const comments: Comment[] = [
    {
      id: id(), task_id: tasks[8].id, workspace_id: wsTeam.id, author_id: PARTNER,
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: commentText }] }] }, body_text: commentText,
      mentions: [], created_at: at(today, "08:40"), updated_at: at(today, "08:40"), deleted_at: null,
    },
  ];
  const act = (actor: string, task: Task, action: string, diff: Record<string, unknown>, when: string, entity: "task" | "comment" = "task"): ActivityEntry => ({
    id: id(), workspace_id: task.workspace_id, project_id: task.project_id, task_id: task.id, actor_id: actor,
    entity_type: entity, entity_id: entity === "comment" ? comments[0].id : task.id, action, diff: { _title: task.title, ...diff }, created_at: when,
  });
  const activity_log: ActivityEntry[] = [
    act(PARTNER, tasks[8], "commented", { snippet: commentText }, at(today, "08:40"), "comment"),
    act(GUEST, tasks[13], "updated", { status: ["todo", "in_progress"] }, at(addDays(today, -1), "17:10")),
    act(userId, tasks[8], "assigned", { user_id: PARTNER }, at(addDays(today, -2), "11:00")),
    act(userId, tasks[0], "created", { title: tasks[0].title }, at(addDays(today, -3), "09:15")),
  ];

  const notifications: Notification[] = [
    {
      id: id(), user_id: userId, workspace_id: wsTeam.id, type: "comment", actor_id: PARTNER, task_id: tasks[8].id, project_id: pAgency.id,
      title: tasks[8].title, body: uz ? "Shartnoma shablonini qoʻshdim, koʻrib chiqing" : "Added the contract template, please review",
      url: `/tasks/${tasks[8].id}`, data: {}, read_at: null, delivery: "done", deliver_after: ts, created_at: at(today, "08:40"),
    },
    {
      id: id(), user_id: userId, workspace_id: wsTeam.id, type: "status_change", actor_id: GUEST, task_id: tasks[13].id, project_id: pClinic.id,
      title: tasks[13].title, body: "in_progress", url: `/tasks/${tasks[13].id}`, data: { from: "todo", to: "in_progress" }, read_at: null,
      delivery: "done", deliver_after: ts, created_at: at(addDays(today, -1), "17:10"),
    },
  ];

  return {
    profiles: [me, partner, guest],
    workspaces: [wsPersonal, wsTeam],
    workspace_members: members,
    areas,
    comments,
    activity_log,
    projects,
    project_members,
    sections,
    tasks,
    task_assignees,
    labels,
    task_labels,
    checklist_items,
    habits,
    habit_logs,
    goals: [goal, goal2],
    key_results,
    key_result_history,
    notes,
    time_blocks,
    time_entries,
    notifications,
  };
}
