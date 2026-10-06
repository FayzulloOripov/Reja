"use client";

import { CalendarClock, Handshake, MapPin, Plus, Repeat, Users } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AvatarStack, PageHeader } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { MeetingDialog } from "@/components/meetings/meeting-dialog";
import { PageContainer } from "@/components/shell/app-client";
import { Button } from "@/components/ui/button";
import { dateIn } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { PARTNER_TEMPLATE } from "@/lib/org";
import { isFullMember } from "@/lib/permissions";
import type { Meeting } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useCurrentWorkspace, useMeetings, useToday, useTz, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";

export default function MeetingsPage() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const role = useWorkspaceRole(ws?.id);
  const all = useMeetings();
  const [dialog, setDialog] = useState<null | "blank" | "partner">(null);
  const today = useToday();
  const tz = useTz();
  // unfinished meetings from today on are upcoming; earlier or finished ones are past
  const { upcoming, past } = useMemo(() => {
    const list = all.filter((m) => m.workspace_id === ws?.id);
    const isPast = (m: Meeting) => Boolean(m.finished_at) || dateIn(tz, m.starts_at) < today;
    return { upcoming: list.filter((m) => !isPast(m)), past: list.filter(isPast).reverse() };
  }, [all, ws?.id, tz, today]);
  const hasPartner = all.some((m) => m.workspace_id === ws?.id && m.template_key === PARTNER_TEMPLATE.key && !m.finished_at);
  const writable = isFullMember(role);

  return (
    <PageContainer>
      <PageHeader
        title={t("meetings.title")}
        subtitle={t("meetings.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-fg"><Users className="size-5" /></span>}
        actions={writable && <Button size="sm" onClick={() => setDialog("blank")}><Plus /> {t("meetings.new")}</Button>}
      />
      {writable && !hasPartner && (
        <button
          type="button"
          onClick={() => setDialog("partner")}
          className="mb-5 flex w-full items-center gap-3 rounded-2xl border border-dashed bg-card/60 p-4 text-left transition-colors hover:bg-card"
        >
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand-fg"><Handshake className="size-5" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">{t("meetings.partner.title")}</span>
            <span className="block text-13 text-muted-foreground">{t("meetings.partner.description")}</span>
          </span>
          <Plus className="size-4 text-muted-foreground" />
        </button>
      )}
      <section aria-labelledby="m-upcoming" className="space-y-2">
        <h2 id="m-upcoming" className="px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground">{t("meetings.upcoming")}</h2>
        {upcoming.length === 0 ? (
          <EmptyState compact illustration="calendar" title={t("meetings.empty")} body={t("meetings.emptyBody")} />
        ) : (
          <ul className="space-y-2">{upcoming.map((m) => <MeetingRow key={m.id} meeting={m} />)}</ul>
        )}
      </section>
      {past.length > 0 && (
        <section aria-labelledby="m-past" className="mt-6 space-y-2">
          <h2 id="m-past" className="px-1 font-sans text-13 font-semibold tracking-normal text-muted-foreground">{t("meetings.past")}</h2>
          <ul className="space-y-2">{past.map((m) => <MeetingRow key={m.id} meeting={m} />)}</ul>
        </section>
      )}
      {dialog && ws && <MeetingDialog workspaceId={ws.id} template={dialog === "partner" ? "partner" : undefined} onClose={() => setDialog(null)} />}
    </PageContainer>
  );
}

function MeetingRow({ meeting }: { meeting: Meeting }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const attendees = useStore((s) => s.data.meeting_attendees);
  const items = useStore((s) => s.data.meeting_items);
  const profiles = useStore((s) => s.data.profiles);
  const project = useStore((s) => (meeting.project_id ? s.data.projects[meeting.project_id] : undefined));
  const people = Object.values(attendees).filter((a) => a.meeting_id === meeting.id && a.user_id).map((a) => profiles[a.user_id!]).filter(Boolean);
  const mine = Object.values(items).filter((i) => i.meeting_id === meeting.id);
  const agenda = mine.filter((i) => i.kind === "agenda");
  const decisions = mine.filter((i) => i.kind === "decision").length;
  const day = dateIn(tz, meeting.starts_at);
  return (
    <li>
      <Link
        href={`/meetings/${meeting.id}`}
        className={cn("flex items-center gap-3 rounded-2xl border bg-card p-3.5 shadow-elev-1 transition-colors hover:bg-muted/40", meeting.finished_at && "opacity-80")}
      >
        <span className="flex w-14 shrink-0 flex-col items-center rounded-xl bg-muted py-1.5 tnum">
          <span className="text-2xs font-medium text-muted-foreground uppercase">{f.weekdaysShort[(new Date(day + "T00:00:00Z").getUTCDay() + 6) % 7]}</span>
          <span className="text-lg leading-6 font-semibold">{Number(day.slice(8))}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-semibold">
            <span className="truncate">{meeting.title}</span>
            {meeting.recurrence && <Repeat role="img" aria-label={t("meetings.recurring")} className="size-3.5 shrink-0 text-muted-foreground" />}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-muted-foreground tnum">
            <span className="inline-flex items-center gap-1"><CalendarClock className="size-3" /> {f.relativeDay(day)}, {f.time(meeting.starts_at)}</span>
            {meeting.location && <span className="inline-flex items-center gap-1"><MapPin className="size-3" /> {meeting.location}</span>}
            {project && <span>{project.name}</span>}
            {agenda.length > 0 && <span>{t("meetings.agendaCount", { done: agenda.filter((a) => a.done).length, total: agenda.length })}</span>}
            {decisions > 0 && <span>{t("meetings.decisionCount", { count: decisions })}</span>}
            {meeting.finished_at && <span className="font-medium text-success-fg">{t("meetings.done")}</span>}
          </span>
        </span>
        {people.length > 0 && <AvatarStack people={people} size={22} max={3} />}
      </Link>
    </li>
  );
}
