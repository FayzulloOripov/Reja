"use client";

import {
  Archive,
  CalendarClock,
  Copy,
  Eye,
  Lock,
  MoreHorizontal,
  Pencil,
  Share2,
  Star,
  Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { toast } from "sonner";
import { AvatarStack } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { safeColor } from "@/lib/colors";
import { useFormat } from "@/lib/format";
import { canManage, canWrite, type Access } from "@/lib/permissions";
import type { Project, ProjectHealth, ProjectTemplateData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { deleteProject, toggleFavorite, updateProject } from "@/store/actions";
import { newTemplate } from "@/store/factories";
import { useFavorites, useProjectHealth, useToday, useTz } from "@/store/hooks";
import { mutate, useStore } from "@/store/store";
import { useProjectPresence } from "@/hooks/use-presence";
import { ProjectSettingsDialog } from "./project-settings-dialog";
import { ShareDialog } from "./share-dialog";

export const HEALTH_STYLE: Record<ProjectHealth, string> = {
  on_track: "bg-success-soft text-success-fg",
  at_risk: "bg-warning-soft text-warning-fg",
  off_track: "bg-danger-soft text-danger-fg",
};

export function HealthPill({ health, className }: { health: ProjectHealth; className?: string }) {
  const t = useTranslations("health");
  const shape = health === "on_track" ? "●" : health === "at_risk" ? "▲" : "■";
  return (
    <span className={cn("inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", HEALTH_STYLE[health], className)}>
      <span aria-hidden className="text-[9px]">{shape}</span>
      {t(health)}
    </span>
  );
}

export function ProjectHeader({ project, access }: { project: Project; access: Access }) {
  const t = useTranslations();
  const router = useRouter();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const health = useProjectHealth(project);
  const favorites = useFavorites();
  const isFav = favorites.some((p) => p.id === project.id);
  const presence = useProjectPresence(project.id);
  const [settings, setSettings] = useState(false);
  const [share, setShare] = useState(false);
  const [name, setName] = useState(project.name);
  const writable = canWrite(access);
  const manager = canManage(access);
  const data = useStore((s) => s.data);

  function saveAsTemplate() {
    const sections = Object.values(data.sections).filter((s) => s.project_id === project.id && !s.deleted_at).sort((a, b) => a.position - b.position);
    const sectionName = new Map(sections.map((s) => [s.id, s.name]));
    const start = project.start_date ?? today;
    const tasks = Object.values(data.tasks)
      .filter((x) => x.project_id === project.id && !x.parent_id && !x.deleted_at)
      .sort((a, b) => a.position - b.position)
      .map((x) => ({
        title: x.title,
        section: x.section_id ? sectionName.get(x.section_id) ?? null : null,
        priority: x.priority,
        estimate_min: x.estimate_min,
        due_offset_days: x.due_date ? Math.round((Date.parse(x.due_date) - Date.parse(start)) / 86_400_000) : null,
        checklist: Object.values(data.checklist_items).filter((c) => c.task_id === x.id).sort((a, b) => a.position - b.position).map((c) => c.text),
        subtasks: Object.values(data.tasks).filter((s) => s.parent_id === x.id && !s.deleted_at).map((s) => ({ title: s.title })),
      }));
    const tpl: ProjectTemplateData = { color: project.color, icon: project.icon, sections: sections.map((s) => s.name), tasks };
    mutate([{ table: "templates", kind: "insert", row: newTemplate({ workspace_id: project.workspace_id, kind: "project", name: project.name, data: tpl }) }]);
    toast.success(t("common.saved"));
  }

  return (
    <header className="space-y-3 pb-4">
      <div className="flex flex-wrap items-start gap-3">
        <span data-color={safeColor(project.color)} className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-pc-soft shadow-elev-1">
          <span className="size-4 rounded-md bg-pc" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <input
              value={name}
              readOnly={!writable}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => {
                const v = name.trim();
                if (v && v !== project.name) updateProject(project.id, { name: v });
                else setName(project.name);
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              aria-label={t("common.name")}
              className="min-w-0 flex-1 truncate bg-transparent font-display text-22 font-bold outline-none sm:text-28"
            />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-13 text-muted-foreground">
            {health && (
              <DropdownMenu>
                <DropdownMenuTrigger disabled={!writable} className="rounded-full">
                  <HealthPill health={health.effective} />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="font-normal text-muted-foreground">
                    {t("health.suggested", { health: t(`health.${health.health}`) })}
                    {health.reason.key && <span className="block text-xs">{t(`health.${health.reason.key}`, { percent: health.reason.percent ?? 0, days: health.reason.days ?? 0 })}</span>}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuRadioGroup
                    value={project.health_manual ? (project.health ?? "auto") : "auto"}
                    onValueChange={(v) => updateProject(project.id, v === "auto" ? { health_manual: false, health: null } : { health_manual: true, health: v as ProjectHealth })}
                  >
                    <DropdownMenuRadioItem value="auto">{t("health.auto")}</DropdownMenuRadioItem>
                    {(["on_track", "at_risk", "off_track"] as const).map((h) => (
                      <DropdownMenuRadioItem key={h} value={h}>{t(`health.${h}`)}</DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            {project.target_date && (
              <span className="inline-flex items-center gap-1 tnum">
                <CalendarClock className="size-3.5" /> {f.dayMonth(project.target_date)}
              </span>
            )}
            {project.visibility === "private" && (
              <span className="inline-flex items-center gap-1">
                <Lock className="size-3.5" /> {t("project.visibilityPrivate")}
              </span>
            )}
            {!writable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                <Eye className="size-3.5" /> {t("project.readOnly")}
              </span>
            )}
            {project.goal && <span className="hidden truncate lg:inline">· {project.goal}</span>}
          </div>
        </div>
        <div className="flex items-center gap-1">
          {presence.length > 0 && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="mr-1 flex items-center">
                  <AvatarStack people={presence} size={26} />
                  <span className="ml-1 size-2 animate-pulse rounded-full bg-success" />
                </span>
              </TooltipTrigger>
              <TooltipContent>{t("project.presence", { names: presence.map((p) => p.name).join(", ") })}</TooltipContent>
            </Tooltip>
          )}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" onClick={() => toggleFavorite(project, !isFav)} aria-pressed={isFav} aria-label={isFav ? t("project.unfavorite") : t("project.favorite")}>
                <Star className={cn(isFav ? "fill-warning text-warning" : "text-muted-foreground")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isFav ? t("project.unfavorite") : t("project.favorite")}</TooltipContent>
          </Tooltip>
          <Button variant="outline" size="sm" onClick={() => setShare(true)} className="bg-card">
            <Share2 /> <span className="hidden sm:inline">{t("project.share")}</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={t("common.more")}>
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {writable && (
                <DropdownMenuItem onSelect={() => setSettings(true)}>
                  <Pencil /> {t("common.settings")}
                </DropdownMenuItem>
              )}
              {writable && (
                <DropdownMenuItem onSelect={saveAsTemplate}>
                  <Copy /> {t("project.saveAsTemplate")}
                </DropdownMenuItem>
              )}
              {writable && (
                <DropdownMenuItem onSelect={() => updateProject(project.id, { status: project.status === "archived" ? "active" : "archived" })}>
                  <Archive /> {project.status === "archived" ? t("project.unarchive") : t("project.archive")}
                </DropdownMenuItem>
              )}
              {manager && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    onSelect={() => {
                      if (window.confirm(t("project.deleteConfirm", { name: project.name }))) {
                        deleteProject(project);
                        router.push("/");
                      }
                    }}
                  >
                    <Trash2 /> {t("common.delete")}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <ProjectSettingsDialog project={project} open={settings} onOpenChange={setSettings} manager={manager} />
      <ShareDialog project={project} open={share} onOpenChange={setShare} manager={manager} />
    </header>
  );
}
