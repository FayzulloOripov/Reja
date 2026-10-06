"use client";

import { ArrowLeft, ArrowRight, Building2, CalendarClock, CheckCircle2, Gavel, ListChecks, MapPin, MoreHorizontal, Plus, Repeat, RotateCcw, Trash2, UserPlus, X } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { RichEditor } from "@/components/editor/rich-editor";
import { PageContainer } from "@/components/shell/app-client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { foldFilter } from "@/components/tasks/pickers";
import { dateIn } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { canWrite, isFullMember } from "@/lib/permissions";
import type { Meeting, MeetingItem, RichDoc } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addMeetingItem,
  decisionToTask,
  deleteMeeting,
  deleteMeetingItem,
  finishMeeting,
  reopenMeeting,
  toggleAttendee,
  updateMeeting,
  updateMeetingItem,
} from "@/store/org-actions";
import { useContacts, useMembers, useProjectAccess, useToday, useTz, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

export default function MeetingPage() {
  const t = useTranslations();
  const { id } = useParams<{ id: string }>();
  const meeting = useStore((s) => s.data.meetings[id]);
  if (!meeting || meeting.deleted_at) {
    return (
      <PageContainer>
        <EmptyState illustration="calendar" title={t("meetings.notFound")} body="" action={<Button asChild variant="outline"><Link href="/meetings">{t("meetings.title")}</Link></Button>} />
      </PageContainer>
    );
  }
  return <MeetingDetail meeting={meeting} />;
}

function MeetingDetail({ meeting }: { meeting: Meeting }) {
  const t = useTranslations();
  const router = useRouter();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const role = useWorkspaceRole(meeting.workspace_id);
  const project = useStore((s) => (meeting.project_id ? s.data.projects[meeting.project_id] : undefined));
  const access = useProjectAccess(project);
  const writable = isFullMember(role) || (project ? canWrite(access) : false);
  const itemsById = useStore((s) => s.data.meeting_items);
  const items = useMemo(() => Object.values(itemsById).filter((i) => i.meeting_id === meeting.id).sort((a, b) => a.position - b.position), [itemsById, meeting.id]);
  const agenda = items.filter((i) => i.kind === "agenda");
  const decisions = items.filter((i) => i.kind === "decision");
  const day = dateIn(tz, meeting.starts_at);
  const [title, setTitle] = useState(meeting.title);

  return (
    <PageContainer>
      <div className="mb-4 flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link href="/meetings"><ArrowLeft /> {t("meetings.title")}</Link>
        </Button>
        <div className="flex-1" />
        {writable && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label={t("common.more")}><MoreHorizontal /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {meeting.finished_at && (
                <DropdownMenuItem onSelect={() => reopenMeeting(meeting)}><RotateCcw /> {t("meetings.reopen")}</DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => {
                  deleteMeeting(meeting);
                  router.push("/meetings");
                }}
              >
                <Trash2 /> {t("common.delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <header className="mb-5 space-y-2">
        <h1 className="sr-only">{meeting.title}</h1>
        <Input
          aria-label={t("meetings.titleLabel")}
          value={title}
          readOnly={!writable}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title.trim() && title !== meeting.title && updateMeeting(meeting.id, { title: title.trim() })}
          className="h-auto border-transparent px-0 font-display text-2xl font-semibold shadow-none focus-visible:border-input focus-visible:px-2 md:text-3xl"
        />
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-13 text-muted-foreground tnum">
          <span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" /> {f.relativeWithDate(day)}, {f.time(meeting.starts_at)} · {f.duration(meeting.duration_min)}</span>
          {meeting.recurrence && <span className="inline-flex items-center gap-1"><Repeat className="size-3.5" /> {t("meetings.recurring")}</span>}
          {meeting.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {meeting.location}</span>}
          {project && <Link href={`/projects/${project.id}`} className="hover:text-foreground">{project.name}</Link>}
          {meeting.finished_at && <span className="inline-flex items-center gap-1 font-medium text-success-fg"><CheckCircle2 className="size-3.5" /> {t("meetings.done")}</span>}
        </div>
        <Attendees meeting={meeting} writable={writable} />
      </header>

      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <ItemSection meeting={meeting} kind="agenda" items={agenda} writable={writable} />
        <ItemSection meeting={meeting} kind="decision" items={decisions} writable={writable} />
      </div>

      <section aria-labelledby="m-notes" className="mt-5 space-y-2">
        <h2 id="m-notes" className="px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground">{t("meetings.notes")}</h2>
        <NotesEditor meeting={meeting} writable={writable} />
      </section>

      {writable && !meeting.finished_at && (
        <div className="mt-6 flex flex-wrap items-center justify-end gap-3">
          {meeting.recurrence && agenda.some((a) => !a.done) && <p className="text-13 text-muted-foreground">{t("meetings.carryHint", { count: agenda.filter((a) => !a.done).length })}</p>}
          <Button
            onClick={() => {
              const next = finishMeeting(meeting);
              if (next) {
                toast.success(t("meetings.nextCreated", { date: f.relativeWithDate(dateIn(tz, next.starts_at)) }), {
                  action: { label: t("meetings.openNext"), onClick: () => router.push(`/meetings/${next.id}`) },
                });
              }
            }}
          >
            <CheckCircle2 /> {t("meetings.finish")}
          </Button>
        </div>
      )}
    </PageContainer>
  );
}

function Attendees({ meeting, writable }: { meeting: Meeting; writable: boolean }) {
  const t = useTranslations();
  const rows = useStore((s) => s.data.meeting_attendees);
  const profiles = useStore((s) => s.data.profiles);
  const contactsById = useStore((s) => s.data.contacts);
  const members = useMembers(meeting.workspace_id);
  const contacts = useContacts(meeting.workspace_id);
  const role = useWorkspaceRole(meeting.workspace_id);
  const list = Object.values(rows).filter((a) => a.meeting_id === meeting.id);
  const has = (kind: "user" | "contact", id: string) => list.some((a) => (kind === "user" ? a.user_id === id : a.contact_id === id));
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label={t("meetings.attendees")}>
      {list.map((a) => (
        <span key={a.id} className="inline-flex h-7 items-center gap-1.5 rounded-full bg-muted py-0.5 pr-2.5 pl-0.5 text-13">
          {a.user_id ? <UserAvatar profile={profiles[a.user_id]} size={22} /> : <span className="flex size-[22px] items-center justify-center rounded-full bg-card"><Building2 className="size-3" /></span>}
          {a.user_id ? profiles[a.user_id]?.name : contactsById[a.contact_id!]?.name}
        </span>
      ))}
      {writable && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7 text-muted-foreground"><UserPlus /> {t("meetings.editAttendees")}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <Command filter={foldFilter}>
              <CommandInput placeholder={t("waiting.searchPlaceholder")} />
              <CommandList>
                <CommandGroup heading={t("waiting.teammates")}>
                  {members.map((m) => (
                    <CommandItem key={m.id} value={`u ${m.name} ${m.id}`} onSelect={() => toggleAttendee(meeting, { kind: "user", id: m.id }, !has("user", m.id))}>
                      <UserAvatar profile={m} size={20} /> <span className="flex-1 truncate">{m.name}</span>
                      {has("user", m.id) && <CheckCircle2 className="size-4 text-brand" />}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {isFullMember(role) && contacts.length > 0 && (
                  <CommandGroup heading={t("contacts.title")}>
                    {contacts.map((c) => (
                      <CommandItem key={c.id} value={`c ${c.name} ${c.id}`} onSelect={() => toggleAttendee(meeting, { kind: "contact", id: c.id }, !has("contact", c.id))}>
                        <Building2 className="size-4" /> <span className="flex-1 truncate">{c.name}</span>
                        {has("contact", c.id) && <CheckCircle2 className="size-4 text-brand" />}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function ItemSection({ meeting, kind, items, writable }: { meeting: Meeting; kind: MeetingItem["kind"]; items: MeetingItem[]; writable: boolean }) {
  const t = useTranslations();
  const [text, setText] = useState("");
  const heading = kind === "agenda" ? t("meetings.agenda") : t("meetings.decisions");
  const Icon = kind === "agenda" ? ListChecks : Gavel;
  return (
    <section aria-labelledby={`m-${kind}`} className="rounded-2xl border bg-card p-3 shadow-elev-1">
      <h2 id={`m-${kind}`} className="mb-1 flex items-center gap-2 px-1 font-sans text-sm font-semibold tracking-normal">
        <Icon className="size-4 text-muted-foreground" /> {heading}
        <span className="text-muted-foreground tnum">{items.length || ""}</span>
      </h2>
      {items.length === 0 && <p className="px-1 py-2 text-13 text-muted-foreground">{kind === "agenda" ? t("meetings.agendaEmpty") : t("meetings.decisionsEmpty")}</p>}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <ItemRow key={item.id} meeting={meeting} item={item} writable={writable} />
        ))}
      </ul>
      {writable && (
        <form
          className="mt-1 flex items-center gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            addMeetingItem(meeting, kind, text);
            setText("");
          }}
        >
          <Plus className="ml-1.5 size-4 shrink-0 text-muted-foreground" />
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={1000}
            aria-label={kind === "agenda" ? t("meetings.addAgenda") : t("meetings.addDecision")}
            placeholder={kind === "agenda" ? t("meetings.addAgenda") : t("meetings.addDecision")}
            className="h-9 border-transparent shadow-none focus-visible:border-input"
          />
        </form>
      )}
    </section>
  );
}

function ItemRow({ meeting, item, writable }: { meeting: Meeting; item: MeetingItem; writable: boolean }) {
  const t = useTranslations();
  const task = useStore((s) => (item.task_id ? s.data.tasks[item.task_id] : undefined));
  const openTask = useUI((s) => s.openTask);
  return (
    <li className="group flex min-h-9 items-start gap-2 rounded-lg px-1.5 py-1.5 hover:bg-muted/60">
      {item.kind === "agenda" ? (
        <Checkbox
          className="mt-0.5"
          checked={item.done}
          disabled={!writable}
          onCheckedChange={(v) => updateMeetingItem(item.id, { done: v === true })}
          aria-label={t("meetings.agendaItem", { text: item.text })}
        />
      ) : (
        <Gavel className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      )}
      <span className={cn("min-w-0 flex-1 text-sm break-words", item.done && "text-muted-foreground line-through")}>{item.text}</span>
      {item.kind === "decision" &&
        (task && !task.deleted_at ? (
          <button type="button" onClick={() => openTask(task.id)} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-success-soft px-2 py-0.5 text-xs font-medium text-success-fg">
            <CheckCircle2 className="size-3" /> {t("meetings.taskCreated")}
          </button>
        ) : (
          writable && (
            <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={() => {
              const created = decisionToTask(meeting, item);
              toast.success(t("meetings.taskToast"), { action: { label: t("common.open"), onClick: () => openTask(created.id) } });
            }}>
              <ArrowRight className="size-3" /> {t("meetings.toTask")}
            </Button>
          )
        ))}
      {writable && (
        <button type="button" onClick={() => deleteMeetingItem(item.id)} aria-label={t("common.delete")} className="shrink-0 rounded p-1 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100">
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );
}

function NotesEditor({ meeting, writable }: { meeting: Meeting; writable: boolean }) {
  const t = useTranslations();
  const pending = useRef<RichDoc | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const id = meeting.id;
    return () => {
      // keep what was typed when the page closes before the save timer fires
      if (timer.current) clearTimeout(timer.current);
      if (pending.current !== undefined) updateMeeting(id, { notes: pending.current });
    };
  }, [meeting.id]);
  return (
    <div className="rounded-xl border bg-card/50 px-3.5 py-3">
      <RichEditor
        value={meeting.notes}
        editable={writable}
        ariaLabel={t("meetings.notes")}
        placeholder={t("meetings.notesPlaceholder")}
        onChange={(doc) => {
          pending.current = doc;
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            updateMeeting(meeting.id, { notes: doc });
            pending.current = undefined;
          }, 600);
        }}
      />
    </div>
  );
}
