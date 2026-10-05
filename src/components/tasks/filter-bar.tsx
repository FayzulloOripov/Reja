"use client";

import { Bookmark, Check, ListFilter, Search, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { PriorityIcon, StatusIcon, UserAvatar } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { countActiveFilters } from "@/lib/filters";
import type { Label, Profile, SavedView, TaskFilters } from "@/lib/types";
import { cn } from "@/lib/utils";
import { newSavedView } from "@/store/factories";
import { mutate } from "@/store/store";
import { PRIORITIES, STATUSES } from "./pickers";

function toggle<T>(list: T[] | undefined, v: T): T[] {
  const l = list ?? [];
  return l.includes(v) ? l.filter((x) => x !== v) : [...l, v];
}

export function FilterBar({
  filters,
  onChange,
  people,
  labels,
  savedViews,
  onSave,
  className,
  extra,
}: {
  filters: TaskFilters;
  onChange: (f: TaskFilters) => void;
  people: Profile[];
  labels: Label[];
  savedViews?: SavedView[];
  onSave?: (name: string) => void;
  className?: string;
  extra?: React.ReactNode;
}) {
  const t = useTranslations();
  const active = countActiveFilters(filters);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={filters.search ?? ""}
          onChange={(e) => onChange({ ...filters, search: e.target.value })}
          placeholder={t("common.search")}
          aria-label={t("common.search")}
          className="h-8 w-40 bg-card pl-8 text-13 sm:w-48"
        />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className={cn("h-8 bg-card", active && "border-brand/50 text-brand-fg")}>
            <ListFilter />
            {active ? t("views.filtersActive", { count: active }) : t("common.filter")}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-60">
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("task.assignees")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-56">
              <DropdownMenuCheckboxItem checked={filters.assignees?.includes("none")} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onChange({ ...filters, assignees: toggle(filters.assignees, "none") })}>
                {t("task.unassigned")}
              </DropdownMenuCheckboxItem>
              {people.map((p) => (
                <DropdownMenuCheckboxItem key={p.id} checked={filters.assignees?.includes(p.id)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onChange({ ...filters, assignees: toggle(filters.assignees, p.id) })}>
                  <UserAvatar profile={p} size={18} /> {p.name}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("priority.label")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {PRIORITIES.map((p) => (
                <DropdownMenuCheckboxItem key={p} checked={filters.priorities?.includes(p)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onChange({ ...filters, priorities: toggle(filters.priorities, p) })}>
                  <PriorityIcon priority={p} /> {t(`priority.${p}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("status.label")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {STATUSES.map((s) => (
                <DropdownMenuCheckboxItem key={s} checked={filters.statuses?.includes(s)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onChange({ ...filters, statuses: toggle(filters.statuses, s), showDone: s === "done" || s === "cancelled" ? true : filters.showDone })}>
                  <StatusIcon status={s} /> {t(`status.${s}`)}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          {labels.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("task.labels")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {labels.map((l) => (
                  <DropdownMenuCheckboxItem key={l.id} checked={filters.labels?.includes(l.id)} onSelect={(e) => e.preventDefault()} onCheckedChange={() => onChange({ ...filters, labels: toggle(filters.labels, l.id) })}>
                    <span className="size-2 rounded-full" style={{ background: `var(--pc-${l.color})` }} /> {l.name}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>{t("task.due")}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={filters.due ?? "any"} onValueChange={(v) => onChange({ ...filters, due: v === "any" ? null : (v as TaskFilters["due"]) })}>
                <DropdownMenuRadioItem value="any">{t("views.dueAny")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="overdue">{t("views.dueOverdue")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="today">{t("views.dueToday")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="week">{t("views.dueWeek")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="none">{t("views.dueNone")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem checked={Boolean(filters.showDone)} onCheckedChange={(v) => onChange({ ...filters, showDone: Boolean(v) })}>
            {t("views.showDone")}
          </DropdownMenuCheckboxItem>
          {active > 0 && (
            <DropdownMenuItem onSelect={() => onChange({ showDone: filters.showDone })}>
              <X /> {t("views.clearFilters")}
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {(savedViews?.length || onSave) && (
        <DropdownMenu onOpenChange={(o) => !o && setNaming(false)}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 text-muted-foreground">
              <Bookmark /> <span className="hidden sm:inline">{t("views.savedViews")}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-60">
            <DropdownMenuLabel>{t("views.savedViews")}</DropdownMenuLabel>
            {savedViews?.map((v) => (
              <DropdownMenuItem key={v.id} onSelect={() => onChange(v.filters)}>
                <Bookmark /> {v.name}
              </DropdownMenuItem>
            ))}
            {onSave && (
              <>
                <DropdownMenuSeparator />
                {naming ? (
                  <form
                    className="flex gap-1 p-1"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (name.trim()) onSave(name.trim());
                      setName("");
                      setNaming(false);
                    }}
                  >
                    <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("views.viewName")} className="h-8" onKeyDown={(e) => e.stopPropagation()} />
                    <Button size="icon-sm" type="submit" aria-label={t("common.save")}>
                      <Check />
                    </Button>
                  </form>
                ) : (
                  <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setNaming(true); }}>
                    <Check /> {t("views.saveView")}
                  </DropdownMenuItem>
                )}
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {extra}
    </div>
  );
}

export function saveView(input: { workspaceId: string; userId: string; projectId?: string | null; name: string; viewType: string; filters: TaskFilters; grouping?: string | null }) {
  mutate([
    {
      table: "saved_views",
      kind: "insert",
      row: newSavedView({
        workspace_id: input.workspaceId,
        user_id: input.userId,
        project_id: input.projectId ?? null,
        name: input.name,
        view_type: input.viewType,
        filters: input.filters,
        grouping: input.grouping ?? null,
        created_by: input.userId,
      }),
    },
  ]);
}
