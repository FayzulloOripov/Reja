"use client";

import { Building2, Check, Handshake } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { UserAvatar } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addDays, dateIn, timeIn, zonedToUtc } from "@/lib/dates";
import { tr } from "@/lib/i18n-client";
import { isOpen } from "@/lib/health";
import { lastWeekStart, PARTNER_TEMPLATE, partnerMeetingStart, weekNumbers } from "@/lib/org";
import { cn } from "@/lib/utils";
import { createMeeting } from "@/store/org-actions";
import { useContacts, useMembers, useProjects, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";

/** Agenda of the weekly partner meeting: last week's numbers and what is overdue right now. */
export function partnerAgenda(workspaceId: string): string[] {
  const s = useStore.getState();
  const me = s.data.profiles[s.userId ?? ""];
  const tz = me?.timezone || "Asia/Tashkent";
  const today = dateIn(tz, new Date());
  const tasks = Object.values(s.data.tasks).filter((t) => t.workspace_id === workspaceId && !t.deleted_at && !t.parent_id);
  const entries = Object.values(s.data.time_entries).filter((e) => e.workspace_id === workspaceId);
  const n = weekNumbers(tasks, entries, lastWeekStart(today), today, tz);
  const overdue = tasks
    .filter((t) => isOpen(t) && t.due_date && t.due_date < today)
    .sort((a, b) => (a.due_date ?? "").localeCompare(b.due_date ?? ""))
    .slice(0, 5);
  return [
    tr("meetings.partner.numbers", { done: n.done, overdue: n.overdue, hours: Math.round((n.minutes / 60) * 10) / 10 }),
    ...overdue.map((t) => tr("meetings.partner.overdueItem", { title: t.title })),
    tr("meetings.partner.money"),
    tr("meetings.partner.nextWeek"),
  ];
}

export function MeetingDialog({ workspaceId, onClose, template }: { workspaceId: string; onClose: () => void; template?: "partner" }) {
  const t = useTranslations();
  const router = useRouter();
  const tz = useTz();
  const today = useToday();
  const uid = useUserId();
  const members = useMembers(workspaceId).filter((m) => m.role !== "guest");
  const contacts = useContacts(workspaceId);
  const projects = useProjects(workspaceId);
  const partner = template === "partner";
  const start = partner ? partnerMeetingStart(tz) : zonedToUtc(addDays(today, 1), "10:00", tz).toISOString();
  const [title, setTitle] = useState(partner ? t("meetings.partner.title") : "");
  const [date, setDate] = useState(dateIn(tz, start));
  const [time, setTime] = useState(timeIn(tz, start));
  const [duration, setDuration] = useState(String(partner ? PARTNER_TEMPLATE.duration : 60));
  const [repeat, setRepeat] = useState(partner ? "weekly" : "none");
  const [projectId, setProjectId] = useState("none");
  const [location, setLocation] = useState("");
  const [users, setUsers] = useState<string[]>(partner ? members.map((m) => m.id) : [uid]);
  const [contactIds, setContactIds] = useState<string[]>([]);

  const submit = () => {
    if (!title.trim() || !date || !time) return;
    const weekday = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"][(new Date(date + "T00:00:00Z").getUTCDay() + 6) % 7];
    const m = createMeeting({
      workspaceId,
      title,
      startsAt: zonedToUtc(date, time, tz).toISOString(),
      durationMin: Number(duration),
      projectId: projectId === "none" ? null : projectId,
      location,
      recurrence: repeat === "weekly" ? `FREQ=WEEKLY;BYDAY=${weekday}` : repeat === "biweekly" ? `FREQ=WEEKLY;INTERVAL=2;BYDAY=${weekday}` : repeat === "monthly" ? "FREQ=MONTHLY" : null,
      templateKey: partner ? PARTNER_TEMPLATE.key : null,
      userIds: users,
      contactIds,
      agenda: partner ? partnerAgenda(workspaceId) : [],
    });
    onClose();
    router.push(`/meetings/${m.id}`);
  };

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {partner && <Handshake className="size-5 text-brand" />}
            {partner ? t("meetings.partner.title") : t("meetings.new")}
          </DialogTitle>
          {partner && <DialogDescription>{t("meetings.partner.description")}</DialogDescription>}
        </DialogHeader>
        <form
          id="meeting-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="m-title">{t("meetings.titleLabel")}</Label>
            <Input id="m-title" autoFocus value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2 space-y-1.5 sm:col-span-1">
              <Label htmlFor="m-date">{t("meetings.date")}</Label>
              <Input id="m-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-time">{t("meetings.time")}</Label>
              <Input id="m-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} required />
            </div>
            <div className="col-span-3 space-y-1.5 sm:col-span-1">
              <Label htmlFor="m-duration">{t("meetings.duration")}</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger id="m-duration" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[15, 30, 45, 60, 90, 120].map((d) => (
                    <SelectItem key={d} value={String(d)}>{t("meetings.minutes", { count: d })}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="m-repeat">{t("meetings.repeat")}</Label>
              <Select value={repeat} onValueChange={setRepeat}>
                <SelectTrigger id="m-repeat" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["none", "weekly", "biweekly", "monthly"].map((r) => (
                    <SelectItem key={r} value={r}>{t(`meetings.repeatOptions.${r}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-project">{t("task.project")}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger id="m-project" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("meetings.noProject")}</SelectItem>
                  {projects.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="m-location">{t("meetings.location")}</Label>
            <Input id="m-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={200} placeholder={t("meetings.locationPlaceholder")} />
          </div>
          <fieldset className="space-y-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t("meetings.attendees")}</legend>
            <div className="flex flex-wrap gap-1.5">
              {members.map((m) => (
                <Chip key={m.id} on={users.includes(m.id)} onClick={() => toggle(users, setUsers, m.id)}>
                  <UserAvatar profile={m} size={18} /> {m.name}
                </Chip>
              ))}
              {contacts.map((c) => (
                <Chip key={c.id} on={contactIds.includes(c.id)} onClick={() => toggle(contactIds, setContactIds, c.id)}>
                  <Building2 className="size-3.5" /> {c.name}
                </Chip>
              ))}
            </div>
          </fieldset>
          {partner && <p className="rounded-lg bg-muted px-3 py-2 text-13 text-muted-foreground">{t("meetings.partner.agendaNote")}</p>}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="meeting-form" disabled={!title.trim()}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn("inline-flex h-8 items-center gap-1.5 rounded-full border px-2.5 text-13", on ? "border-brand bg-brand-soft text-brand-fg" : "text-muted-foreground hover:bg-muted")}
    >
      {children}
      {on && <Check className="size-3.5" />}
    </button>
  );
}
