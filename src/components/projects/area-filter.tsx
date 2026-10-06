"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { ProjectDot } from "@/components/common/bits";
import type { Area, Project, Task } from "@/lib/types";
import { cn } from "@/lib/utils";

export type AreaFilterValue = "all" | "none" | string;

/** Remembered per page in this browser. */
export function useAreaFilter(storageKey: string): [AreaFilterValue, (v: AreaFilterValue) => void] {
  const [value, setValue] = useState<AreaFilterValue>(() => {
    try {
      return localStorage.getItem(`reja:area:${storageKey}`) ?? "all";
    } catch {
      return "all";
    }
  });
  const set = (v: AreaFilterValue) => {
    setValue(v);
    try {
      localStorage.setItem(`reja:area:${storageKey}`, v);
    } catch {
      // storage unavailable
    }
  };
  return [value, set];
}

/** Does a task belong to the chosen area? Inbox tasks count as "no area". */
export function inArea(task: Pick<Task, "project_id">, projects: Record<string, Pick<Project, "area_id">>, value: AreaFilterValue): boolean {
  if (value === "all") return true;
  const areaId = task.project_id ? (projects[task.project_id]?.area_id ?? null) : null;
  return value === "none" ? areaId === null : areaId === value;
}

export function AreaFilterChips({ areas, value, onChange, className }: { areas: Area[]; value: AreaFilterValue; onChange: (v: AreaFilterValue) => void; className?: string }) {
  const t = useTranslations("areas");
  if (areas.length < 2) return null;
  const chip = (v: AreaFilterValue, label: string, color?: string) => (
    <button
      key={v}
      type="button"
      role="radio"
      aria-checked={value === v}
      onClick={() => onChange(v)}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
        value === v ? "border-foreground/20 bg-foreground text-background" : "bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {color && <ProjectDot color={color} size="sm" />}
      {label}
    </button>
  );
  return (
    <div role="radiogroup" aria-label={t("filter")} className={cn("scrollbar-none -mx-1 flex gap-1.5 overflow-x-auto px-1", className)}>
      {chip("all", t("all"))}
      {areas.map((a) => chip(a.id, a.name, a.color))}
      {chip("none", t("none"))}
    </div>
  );
}
