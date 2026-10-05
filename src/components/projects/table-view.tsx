"use client";

import { ArrowDown, ArrowUp, Download } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AvatarStack, PriorityIcon, StatusIcon } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { downloadText, toCSV } from "@/lib/csv";
import { useFormat } from "@/lib/format";
import type { Profile, Project, Section, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { assign, moveTasks, setDue, updateTask } from "@/store/actions";
import { assigneesByTask, labelsByTask, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { AssigneePicker, DatePicker, PriorityPicker, ProjectPicker, StatusPicker } from "../tasks/pickers";

type Col = "title" | "status" | "priority" | "assignee" | "due" | "start" | "deadline" | "section" | "labels" | "estimate" | "created";
const PRIORITY_RANK = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 } as const;
const STATUS_RANK = { in_progress: 0, todo: 1, waiting: 2, done: 3, cancelled: 4 } as const;

export function TableView({ project, tasks, sections, people, writable }: { project: Project; tasks: Task[]; sections: Section[]; people: Profile[]; writable: boolean }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const openTask = useUI((s) => s.openTask);
  const assignees = useStore((s) => s.data.task_assignees);
  const profiles = useStore((s) => s.data.profiles);
  const taskLabels = useStore((s) => s.data.task_labels);
  const labels = useStore((s) => s.data.labels);
  const [sort, setSort] = useState<{ col: Col; dir: 1 | -1 }>({ col: "due", dir: 1 });
  const sectionName = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);
  const byTask = assigneesByTask(assignees);
  const labelsOf = (id: string) => (labelsByTask(taskLabels)[id] ?? []).map((l) => labels[l.label_id]).filter((l) => l && !l.deleted_at);

  const rows = useMemo(() => {
    const key = (x: Task): string | number => {
      switch (sort.col) {
        case "title": return x.title.toLowerCase();
        case "status": return STATUS_RANK[x.status];
        case "priority": return PRIORITY_RANK[x.priority];
        case "assignee": return (byTask[x.id]?.[0] ? profiles[byTask[x.id][0].user_id]?.name : "~") ?? "~";
        case "due": return (x.due_date ?? "9999") + (x.due_at ?? "");
        case "start": return x.start_date ?? "9999";
        case "deadline": return x.deadline ?? "9999";
        case "section": return x.section_id ? sectionName.get(x.section_id) ?? "~" : "~";
        case "labels": return labelsOf(x.id).map((l) => l!.name).join(",") || "~";
        case "estimate": return x.estimate_min ?? 1e9;
        case "created": return x.created_at;
      }
    };
    return [...tasks].sort((a, b) => {
      const ka = key(a);
      const kb = key(b);
      return (ka < kb ? -1 : ka > kb ? 1 : 0) * sort.dir;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, sort, byTask, profiles, sectionName, taskLabels, labels]);

  const header = (col: Col, label: string, className?: string) => (
    <th scope="col" className={cn("px-3 py-2 text-left text-xs font-semibold whitespace-nowrap text-muted-foreground", className)} aria-sort={sort.col === col ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button onClick={() => setSort((s) => ({ col, dir: s.col === col ? ((s.dir * -1) as 1 | -1) : 1 }))} className="inline-flex items-center gap-1 hover:text-foreground">
        {label}
        {sort.col === col && (sort.dir === 1 ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  function exportCsv() {
    const data = rows.map((x) => ({
      title: x.title,
      status: t(`status.${x.status}`),
      priority: t(`priority.${x.priority}`),
      assignees: (byTask[x.id] ?? []).map((a) => profiles[a.user_id]?.name).join("; "),
      due: x.due_date ?? "",
      start: x.start_date ?? "",
      deadline: x.deadline ?? "",
      section: x.section_id ? (sectionName.get(x.section_id) ?? "") : "",
      labels: labelsOf(x.id).map((l) => l!.name).join("; "),
      estimate_min: x.estimate_min ?? "",
      created: x.created_at.slice(0, 10),
    }));
    downloadText(`${project.name}.csv`, toCSV(data));
  }

  const cell = "px-3 py-1.5 whitespace-nowrap";
  const btn = "rounded px-1.5 py-1 text-13 hover:bg-muted disabled:pointer-events-none";

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" className="bg-card" onClick={exportCsv}>
          <Download /> {t("common.downloadCsv")}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-2xl border bg-card shadow-elev-1">
        <table className="w-full min-w-[980px] text-13">
          <thead className="border-b bg-muted/50">
            <tr>
              {header("title", t("table.title"), "w-[32%]")}
              {header("status", t("status.label"))}
              {header("priority", t("priority.label"))}
              {header("assignee", t("table.assignee"))}
              {header("due", t("table.due"))}
              {header("start", t("table.start"))}
              {header("deadline", t("table.deadline"))}
              {header("section", t("table.section"))}
              {header("labels", t("table.labels"))}
              {header("estimate", t("table.estimate"))}
              {header("created", t("table.created"))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((x) => {
              const ids = (byTask[x.id] ?? []).map((a) => a.user_id);
              return (
                <tr key={x.id} className="hover:bg-muted/40">
                  <td className="px-3 py-1">
                    <input
                      defaultValue={x.title}
                      readOnly={!writable}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v && v !== x.title) updateTask(x.id, { title: v });
                      }}
                      onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                      onDoubleClick={() => openTask(x.id)}
                      className={cn("w-full rounded bg-transparent px-1.5 py-1 outline-none focus:bg-muted", x.status === "done" && "text-muted-foreground line-through")}
                      aria-label={t("table.title")}
                    />
                  </td>
                  <td className={cell}>
                    <StatusPicker value={x.status} onChange={(s) => updateTask(x.id, { status: s })}>
                      <button className={cn(btn, "inline-flex items-center gap-1.5")} disabled={!writable}>
                        <StatusIcon status={x.status} /> {t(`status.${x.status}`)}
                      </button>
                    </StatusPicker>
                  </td>
                  <td className={cell}>
                    <PriorityPicker value={x.priority} onChange={(p) => updateTask(x.id, { priority: p })}>
                      <button className={btn} disabled={!writable}><PriorityIcon priority={x.priority} withLabel /></button>
                    </PriorityPicker>
                  </td>
                  <td className={cell}>
                    <AssigneePicker people={people} selected={ids} onToggle={(uid, on) => assign(x, uid, on)}>
                      <button className={cn(btn, "min-w-12")} disabled={!writable}>
                        {ids.length ? <AvatarStack people={ids.map((id) => profiles[id]).filter(Boolean)} size={20} /> : <span className="text-muted-foreground">—</span>}
                      </button>
                    </AssigneePicker>
                  </td>
                  <td className={cn(cell, "tnum")}>
                    <DatePicker value={x.due_date} time={x.due_at ? f.time(x.due_at) : null} onChange={(d, tm) => setDue(x, d, tm)}>
                      <button className={cn(btn, x.due_date && x.due_date < today && x.status !== "done" && "text-danger-fg")} disabled={!writable}>
                        {x.due_date ? f.dayMonth(x.due_date) : "—"}
                      </button>
                    </DatePicker>
                  </td>
                  <td className={cn(cell, "tnum")}>
                    <DatePicker value={x.start_date} onChange={(d) => updateTask(x.id, { start_date: d })} allowTime={false}>
                      <button className={btn} disabled={!writable}>{x.start_date ? f.dayMonth(x.start_date) : "—"}</button>
                    </DatePicker>
                  </td>
                  <td className={cn(cell, "tnum")}>
                    <DatePicker value={x.deadline} onChange={(d) => updateTask(x.id, { deadline: d })} allowTime={false}>
                      <button className={btn} disabled={!writable}>{x.deadline ? f.dayMonth(x.deadline) : "—"}</button>
                    </DatePicker>
                  </td>
                  <td className={cell}>
                    <ProjectPicker value={project.id} sectionId={x.section_id} sections={sections} allowInbox={false} onChange={(p, s) => (p === project.id ? updateTask(x.id, { section_id: s ?? null }) : moveTasks([x.id], { projectId: p, sectionId: s }))}>
                      <button className={btn} disabled={!writable}>{x.section_id ? sectionName.get(x.section_id) : "—"}</button>
                    </ProjectPicker>
                  </td>
                  <td className={cell}>
                    <div className="flex gap-1">
                      {labelsOf(x.id).map((l) => (
                        <span key={l!.id} data-color={l!.color} className="rounded bg-pc-soft px-1.5 text-xs text-pc-fg">{l!.name}</span>
                      ))}
                    </div>
                  </td>
                  <td className={cn(cell, "tnum text-muted-foreground")}>{x.estimate_min ? f.duration(x.estimate_min) : "—"}</td>
                  <td className={cn(cell, "tnum text-muted-foreground")}>{f.dayMonth(x.created_at.slice(0, 10))}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
