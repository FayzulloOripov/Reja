"use client";

import { AlertTriangle, ArrowRightLeft, Building2, CalendarClock, Filter, FolderPlus, Plus, Trophy } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { StatTile } from "@/components/charts/kit";
import { PageHeader, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { DealDialog, LostDialog, ToProjectDialog } from "@/components/business/deal-dialogs";
import { ModuleOff } from "@/components/business/module-off";
import { PageContainer } from "@/components/shell/app-client";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { startOfMonth } from "@/lib/dates";
import { safeColor } from "@/lib/colors";
import { useFormat } from "@/lib/format";
import { compactUzs, moneyLabel } from "@/lib/money";
import { isFullMember } from "@/lib/permissions";
import { dealUzs, pipelineStats, staleReason } from "@/lib/pipeline";
import type { Deal, DealStage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { moveDeal } from "@/store/business-actions";
import { useCurrentWorkspace, useToday, useTz, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";

/** Deals by stage: value, next step, stale warnings and conversion. */
export default function PipelinePage() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const role = useWorkspaceRole(ws?.id);
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const stagesById = useStore((s) => s.data.deal_stages);
  const dealsById = useStore((s) => s.data.deals);
  const [editing, setEditing] = useState<Deal | "new" | null>(null);
  const [losing, setLosing] = useState<{ deal: Deal; stage: DealStage } | null>(null);
  const [converting, setConverting] = useState<Deal | null>(null);

  const stages = useMemo(() => Object.values(stagesById).filter((s) => s.workspace_id === ws?.id).sort((a, b) => a.position - b.position), [stagesById, ws?.id]);
  const deals = useMemo(() => Object.values(dealsById).filter((d) => d.workspace_id === ws?.id && !d.deleted_at), [dealsById, ws?.id]);
  const stats = useMemo(() => pipelineStats(deals, stagesById, ws?.usd_rate ?? 12800, startOfMonth(today), today, tz), [deals, stagesById, ws?.usd_rate, today, tz]);
  const stale = deals.filter((d) => staleReason(d, stagesById[d.stage_id], today, tz)).length;

  if (!ws) return null;
  if (!ws.modules?.pipeline) return <ModuleOff module="pipeline" />;
  if (!isFullMember(role)) {
    return (
      <PageContainer>
        <EmptyState illustration="board" title={t("pipeline.guest")} body="" />
      </PageContainer>
    );
  }
  const words = { mln: t("money.mln"), k: t("money.thousand") };
  const move = (deal: Deal, stage: DealStage) => {
    if (stage.kind === "lost") setLosing({ deal, stage });
    else {
      moveDeal(deal, stage);
      if (stage.kind === "won" && !deal.project_id) setConverting({ ...deal, stage_id: stage.id });
    }
  };

  return (
    <PageContainer wide>
      <PageHeader
        title={t("pipeline.title")}
        subtitle={t("pipeline.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-brand-soft text-brand-fg"><Filter className="size-5" /></span>}
        actions={stages.length > 0 && <Button size="sm" onClick={() => setEditing("new")}><Plus /> {t("pipeline.newDeal")}</Button>}
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label={t("pipeline.openDeals")} value={f.num(stats.open)} hint={compactUzs(f.num, stats.openValue, words)} />
        <StatTile label={t("pipeline.wonThisMonth")} value={f.num(stats.won)} hint={compactUzs(f.num, stats.wonValue, words)} />
        <StatTile label={t("pipeline.conversion")} value={stats.conversion === null ? "—" : `${f.num(stats.conversion)}%`} hint={t("pipeline.conversionHint", { won: stats.won, lost: stats.lost })} />
        <StatTile label={t("pipeline.needAttention")} value={f.num(stale)} hint={t("pipeline.needAttentionHint")} />
      </div>

      {stages.length === 0 ? (
        <EmptyState illustration="board" title={t("pipeline.noStages")} body={t("pipeline.noStagesBody")} />
      ) : (
        <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0" role="list" aria-label={t("pipeline.title")}>
          {stages.map((stage) => {
            const list = deals.filter((d) => d.stage_id === stage.id).sort((a, b) => a.position - b.position);
            const value = list.reduce((n, d) => n + dealUzs(d, ws.usd_rate), 0);
            return (
              <section
                key={stage.id}
                role="listitem"
                aria-label={stage.name}
                data-stage={stage.kind}
                data-color={safeColor(stage.color)}
                className="flex w-[280px] shrink-0 snap-start flex-col rounded-2xl border bg-muted/40 p-2"
              >
                <header className="flex items-center gap-2 px-1.5 pt-1 pb-2">
                  <span className="size-2.5 rounded-full bg-pc" aria-hidden />
                  <h2 className="min-w-0 flex-1 truncate font-sans text-sm font-semibold tracking-normal">{stage.name}</h2>
                  <span className="text-xs text-muted-foreground tnum">{list.length}</span>
                </header>
                {value > 0 && <p className="px-1.5 pb-2 text-xs text-muted-foreground tnum">{compactUzs(f.num, value, words)} soʻm</p>}
                <ul className="flex flex-col gap-2">
                  {list.map((deal) => (
                    <DealCard key={deal.id} deal={deal} stage={stage} stages={stages} onOpen={() => setEditing(deal)} onMove={(s) => move(deal, s)} onConvert={() => setConverting(deal)} />
                  ))}
                </ul>
                {stage.kind === "open" && (
                  <Button variant="ghost" size="sm" className="mt-1 justify-start text-muted-foreground" onClick={() => setEditing("new")}>
                    <Plus /> {t("pipeline.newDeal")}
                  </Button>
                )}
              </section>
            );
          })}
        </div>
      )}
      {editing && <DealDialog ws={ws} deal={editing === "new" ? null : editing} stages={stages} onClose={() => setEditing(null)} onMove={move} onConvert={(d) => setConverting(d)} />}
      {losing && <LostDialog deal={losing.deal} stage={losing.stage} onClose={() => setLosing(null)} />}
      {converting && <ToProjectDialog deal={converting} onClose={() => setConverting(null)} />}
    </PageContainer>
  );
}

function DealCard({ deal, stage, stages, onOpen, onMove, onConvert }: { deal: Deal; stage: DealStage; stages: DealStage[]; onOpen: () => void; onMove: (s: DealStage) => void; onConvert: () => void }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const owner = useStore((s) => (deal.owner_id ? s.data.profiles[deal.owner_id] : undefined));
  const contact = useStore((s) => (deal.contact_id ? s.data.contacts[deal.contact_id] : undefined));
  const project = useStore((s) => (deal.project_id ? s.data.projects[deal.project_id] : undefined));
  const reason = staleReason(deal, stage, today, tz);
  return (
    <li>
      <article className="rounded-xl border bg-card p-3 shadow-elev-1" aria-label={deal.title}>
        <button type="button" onClick={onOpen} className="block w-full text-left">
          <span className="flex items-start gap-2">
            <span className="min-w-0 flex-1 text-sm font-medium break-words">{deal.title}</span>
            {owner && <UserAvatar profile={owner} size={20} />}
          </span>
          {deal.value != null && <span className="mt-1 block text-13 font-semibold tnum">{moneyLabel(f.num, Number(deal.value), deal.currency)}</span>}
          <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted-foreground">
            {contact && <span className="inline-flex items-center gap-1"><Building2 className="size-3" /> {contact.name}</span>}
            {deal.source && <span>{deal.source}</span>}
            {deal.next_step && (
              <span className={cn("inline-flex items-center gap-1", deal.next_step_date && deal.next_step_date < today && "font-medium text-danger-fg")}>
                <CalendarClock className="size-3" /> {deal.next_step}
                {deal.next_step_date && ` · ${f.relativeDay(deal.next_step_date)}`}
              </span>
            )}
            {stage.kind === "lost" && deal.lost_reason && <span className="italic">«{deal.lost_reason}»</span>}
          </span>
          {reason && (
            <span className="mt-2 inline-flex items-center gap-1 rounded-md bg-warning-soft px-1.5 py-0.5 text-2xs font-medium text-warning-fg">
              <AlertTriangle className="size-3" /> {t(`pipeline.stale.${reason}`)}
            </span>
          )}
        </button>
        <div className="mt-2 flex items-center gap-1 border-t pt-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" aria-label={t("pipeline.moveDeal", { title: deal.title })}>
                <ArrowRightLeft /> {t("pipeline.move")}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuLabel>{t("pipeline.moveTo")}</DropdownMenuLabel>
              {stages.filter((s) => s.id !== stage.id).map((s) => (
                <DropdownMenuItem key={s.id} onSelect={() => onMove(s)}>
                  {s.kind === "won" && <Trophy className="text-success" />}
                  {s.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="flex-1" />
          {stage.kind === "won" &&
            (project ? (
              <Link href={`/projects/${project.id}`} className="truncate text-xs font-medium text-brand-fg hover:underline">{project.name}</Link>
            ) : (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={onConvert}>
                <FolderPlus /> {t("pipeline.toProject")}
              </Button>
            ))}
        </div>
      </article>
    </li>
  );
}
