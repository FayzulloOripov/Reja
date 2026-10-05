"use client";

import { CalendarDays, CalendarOff, Check, Clock, Plus, Sofa, Sun, Sunrise, Tag, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { PriorityIcon, ProjectDot, StatusIcon, UserAvatar } from "@/components/common/bits";
import { Calendar } from "@/components/ui/calendar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PROJECT_COLORS } from "@/lib/colors";
import { addDays, nextWeekday, parseISODate, toISODate } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { matchScore } from "@/lib/text";
import type { Label, Profile, Project, Section, TaskPriority, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCurrentWorkspace, useProjects, useToday, useTz, useWorkspaces } from "@/store/hooks";

/** cmdk filter that folds Uzbek apostrophes and ranks prefix matches first. */
export function foldFilter(value: string, search: string, keywords?: string[]) {
  const text = [value, ...(keywords ?? [])].join(" ");
  return matchScore(text, search) / 100;
}

// ------------------------------------------------------------------ date

/** react-day-picker works with local Dates; build one for the calendar day without a zone shift. */
export function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function DatePicker({
  value,
  time,
  onChange,
  children,
  allowTime = true,
  align = "start",
}: {
  value: string | null;
  time?: string | null;
  onChange: (date: string | null, time?: string | null) => void;
  children: ReactNode;
  allowTime?: boolean;
  align?: "start" | "end" | "center";
}) {
  const t = useTranslations("common");
  const tt = useTranslations("task");
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const [open, setOpen] = useState(false);
  const [timeValue, setTimeValue] = useState(time ?? "");

  const quick: { label: string; date: string | null; icon: ReactNode; hint?: string }[] = [
    { label: t("today"), date: today, icon: <Sun className="text-brand" /> },
    { label: t("tomorrow"), date: addDays(today, 1), icon: <Sunrise className="text-warning-fg" />, hint: f.weekdaysShort[(parseISODate(addDays(today, 1)).getUTCDay() + 6) % 7] },
    { label: f.weekdays[5][0].toUpperCase() + f.weekdays[5].slice(1), date: nextWeekday(today, 6, false), icon: <Sofa className="text-info" /> },
    { label: t("nextWeek"), date: nextWeekday(today, 1, false), icon: <CalendarDays className="text-success" /> },
    { label: t("noDate"), date: null, icon: <CalendarOff className="text-muted-foreground" /> },
  ];

  const pick = (d: string | null) => {
    onChange(d, d && allowTime ? timeValue || null : null);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) setTimeValue(time ?? ""); }}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <div className="flex flex-col sm:flex-row">
          <ul className="flex flex-col gap-0.5 border-b p-1.5 sm:w-44 sm:border-r sm:border-b-0">
            {quick.map((q) => (
              <li key={q.label}>
                <button
                  onClick={() => pick(q.date)}
                  className={cn(
                    "flex h-8 w-full items-center gap-2 rounded-md px-2 text-left text-13 hover:bg-muted [&_svg]:size-4",
                    q.date === value && "bg-muted font-medium",
                  )}
                >
                  {q.icon}
                  <span className="flex-1">{q.label}</span>
                  {q.date && <span className="text-2xs text-muted-foreground tnum">{f.dayMonth(q.date)}</span>}
                </button>
              </li>
            ))}
          </ul>
          <div>
            <Calendar
              mode="single"
              weekStartsOn={1}
              selected={value ? localDate(value) : undefined}
              defaultMonth={value ? localDate(value) : localDate(today)}
              onSelect={(d) => d && pick(toISODate(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))))}
              formatters={{
                formatCaption: (d) => `${f.months[d.getMonth()]} ${d.getFullYear()}`,
                formatWeekdayName: (d) => f.weekdaysShort[(d.getDay() + 6) % 7],
              }}
            />
            {allowTime && (
              <div className="flex items-center gap-2 border-t px-3 py-2">
                <Clock className="size-4 text-muted-foreground" />
                <label className="sr-only" htmlFor="due-time">{tt("dueTime")}</label>
                <Input
                  id="due-time"
                  type="time"
                  value={timeValue}
                  onChange={(e) => setTimeValue(e.target.value)}
                  onBlur={() => value && onChange(value, timeValue || null)}
                  className="h-8 w-28 tnum"
                />
                {timeValue && (
                  <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { setTimeValue(""); if (value) onChange(value, null); }}>
                    {t("clear")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------------ project

export function ProjectPicker({
  value,
  sectionId,
  sections,
  onChange,
  children,
  allowInbox = true,
  workspaceScoped = false,
}: {
  value: string | null;
  sectionId?: string | null;
  sections?: Section[];
  onChange: (projectId: string | null, sectionId?: string | null) => void;
  children: ReactNode;
  allowInbox?: boolean;
  workspaceScoped?: boolean;
}) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  const ws = useCurrentWorkspace();
  const workspaces = useWorkspaces();
  const projects = useProjects(workspaceScoped ? ws?.id : undefined);
  const byWs = useMemo(() => {
    const m = new Map<string, Project[]>();
    for (const p of projects) m.set(p.workspace_id, [...(m.get(p.workspace_id) ?? []), p]);
    return m;
  }, [projects]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command filter={foldFilter}>
          <CommandInput placeholder={t("common.search")} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            {allowInbox && (
              <CommandGroup>
                <CommandItem value={t("nav.inbox")} onSelect={() => { onChange(null, null); setOpen(false); }}>
                  <span className="size-2.5 rounded-full border-2 border-muted-foreground" />
                  {t("nav.inbox")}
                  {value === null && <Check className="ml-auto size-4" />}
                </CommandItem>
              </CommandGroup>
            )}
            {workspaces.map((w) =>
              byWs.get(w.id)?.length ? (
                <CommandGroup key={w.id} heading={workspaces.length > 1 ? w.name : undefined}>
                  {byWs.get(w.id)!.map((p) => (
                    <div key={p.id}>
                      <CommandItem value={`${p.name} ${p.id}`} keywords={[p.name]} onSelect={() => { onChange(p.id, null); setOpen(false); }}>
                        <ProjectDot color={p.color} />
                        <span className="truncate">{p.name}</span>
                        {value === p.id && !sectionId && <Check className="ml-auto size-4" />}
                      </CommandItem>
                      {value === p.id &&
                        sections?.map((s) => (
                          <CommandItem key={s.id} value={`${p.name} ${s.name} ${s.id}`} keywords={[s.name]} onSelect={() => { onChange(p.id, s.id); setOpen(false); }} className="pl-7 text-muted-foreground">
                            {s.name}
                            {sectionId === s.id && <Check className="ml-auto size-4" />}
                          </CommandItem>
                        ))}
                    </div>
                  ))}
                </CommandGroup>
              ) : null,
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------------ priority & status

export const PRIORITIES: TaskPriority[] = ["urgent", "high", "medium", "low", "none"];
export const STATUSES: TaskStatus[] = ["todo", "in_progress", "waiting", "done", "cancelled"];

export function PriorityPicker({ value, onChange, children }: { value: TaskPriority; onChange: (p: TaskPriority) => void; children: ReactNode }) {
  const t = useTranslations("priority");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-48 p-1" align="start">
        {PRIORITIES.map((p, i) => (
          <button
            key={p}
            onClick={() => { onChange(p); setOpen(false); }}
            className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-13 hover:bg-muted"
          >
            <PriorityIcon priority={p} />
            <span className="flex-1 text-left">{t(p)}</span>
            {p !== "none" && <span className="text-2xs text-muted-foreground">!{i + 1}</span>}
            {value === p && <Check className="size-4" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

export function StatusPicker({ value, onChange, children }: { value: TaskStatus; onChange: (s: TaskStatus) => void; children: ReactNode }) {
  const t = useTranslations("status");
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-52 p-1" align="start">
        {STATUSES.map((s) => (
          <button key={s} onClick={() => { onChange(s); setOpen(false); }} className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-13 hover:bg-muted">
            <StatusIcon status={s} />
            <span className="flex-1 text-left">{t(s)}</span>
            {value === s && <Check className="size-4" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

// ------------------------------------------------------------------ people & labels

export function AssigneePicker({
  people,
  selected,
  onToggle,
  children,
}: {
  people: Profile[];
  selected: string[];
  onToggle: (userId: string, on: boolean) => void;
  children: ReactNode;
}) {
  const t = useTranslations();
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command filter={foldFilter}>
          <CommandInput placeholder={t("task.assign")} />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            <CommandGroup>
              {people.map((p) => {
                const on = selected.includes(p.id);
                return (
                  <CommandItem key={p.id} value={`${p.name} ${p.email ?? ""} ${p.id}`} keywords={[p.name]} onSelect={() => onToggle(p.id, !on)}>
                    <UserAvatar profile={p} size={20} />
                    <span className="truncate">{p.name}</span>
                    {on && <Check className="ml-auto size-4 text-brand" />}
                  </CommandItem>
                );
              })}
              {people.length === 0 && (
                <div className="flex items-center gap-2 px-2 py-3 text-13 text-muted-foreground">
                  <UserRound className="size-4" /> {t("task.unassigned")}
                </div>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function LabelPicker({
  labels,
  selected,
  onToggle,
  onCreate,
  children,
}: {
  labels: Label[];
  selected: string[];
  onToggle: (labelId: string, on: boolean) => void;
  onCreate?: (name: string) => void;
  children: ReactNode;
}) {
  const t = useTranslations();
  const [search, setSearch] = useState("");
  const exists = labels.some((l) => l.name.toLowerCase() === search.trim().toLowerCase());
  return (
    <Popover onOpenChange={(o) => !o && setSearch("")}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command filter={foldFilter}>
          <CommandInput placeholder={t("task.addLabel")} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandGroup>
              {labels.map((l) => {
                const on = selected.includes(l.id);
                return (
                  <CommandItem key={l.id} value={`${l.name} ${l.id}`} keywords={[l.name]} onSelect={() => onToggle(l.id, !on)}>
                    <Tag className="size-3.5" style={{ color: `var(--pc-${l.color})` }} />
                    <span className="truncate">{l.name}</span>
                    {on && <Check className="ml-auto size-4 text-brand" />}
                  </CommandItem>
                );
              })}
              {onCreate && search.trim() && !exists && (
                <CommandItem value={`__create ${search}`} onSelect={() => { onCreate(search.trim()); setSearch(""); }}>
                  <Plus className="size-4" /> {t("task.newLabel", { name: search.trim() })}
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const t = useTranslations("common");
  return (
    <div role="radiogroup" aria-label={t("color")} className="flex flex-wrap gap-1.5">
      {PROJECT_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          role="radio"
          aria-checked={value === c}
          aria-label={c}
          data-color={c}
          onClick={() => onChange(c)}
          className={cn(
            "size-7 rounded-full bg-pc transition-transform hover:scale-110",
            value === c && "ring-2 ring-pc ring-offset-2 ring-offset-background",
          )}
        />
      ))}
    </div>
  );
}
