"use client";

import { Globe, Lock, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BUILTIN_TEMPLATES } from "@/lib/templates";
import type { ProjectTemplateData } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createProject } from "@/store/actions";
import { useCurrentWorkspace, useToday } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { ColorPicker } from "../tasks/pickers";
import { PROJECT_COLORS } from "@/lib/colors";

export function NewProjectDialog() {
  const t = useTranslations();
  const locale = useLocale() as "uz" | "en";
  const open = useUI((s) => s.newProjectOpen);
  const setOpen = useUI((s) => s.setNewProject);
  const router = useRouter();
  const ws = useCurrentWorkspace();
  const today = useToday();
  const templates = useStore((s) => s.data.templates);
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>("sky");
  const [visibility, setVisibility] = useState<"workspace" | "private">("workspace");
  const [area, setArea] = useState("");
  const [goal, setGoal] = useState("");
  const [start, setStart] = useState("");
  const [target, setTarget] = useState("");
  const [template, setTemplate] = useState<string>("blank");

  useEffect(() => {
    if (open) {
      setName("");
      setColor(PROJECT_COLORS[Math.floor(Math.random() * PROJECT_COLORS.length)]);
      setVisibility(ws?.is_personal ? "private" : "workspace");
      setArea("");
      setGoal("");
      setStart("");
      setTarget("");
      setTemplate("blank");
    }
  }, [open, ws?.is_personal]);

  const options = useMemo(() => {
    const own = Object.values(templates)
      .filter((tp) => tp.kind === "project" && tp.workspace_id === ws?.id)
      .map((tp) => ({ key: tp.id, name: tp.name, data: tp.data as ProjectTemplateData, color: (tp.data as ProjectTemplateData).color }));
    const builtin = BUILTIN_TEMPLATES.map((b) => ({ key: b.key, name: b.name[locale], data: b.data[locale], color: b.color }));
    return [...own, ...builtin];
  }, [templates, ws?.id, locale]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !ws) return;
    const chosen = options.find((o) => o.key === template);
    const project = createProject(
      {
        workspace_id: ws.id,
        name,
        color,
        visibility,
        area: area || null,
        goal: goal || null,
        start_date: start || (chosen ? today : null),
        target_date: target || null,
      },
      chosen ? { sections: chosen.data.sections, tasks: chosen.data.tasks } : undefined,
    );
    toast.success(t("project.createdToast", { name: project.name }));
    setOpen(false);
    router.push(`/projects/${project.id}`);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{t("project.new")}</DialogTitle>
            <DialogDescription className="sr-only">{t("project.new")}</DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="project-name">{t("common.name")}</Label>
            <Input id="project-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t("project.namePlaceholder")} maxLength={120} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("common.color")}</Label>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          <div className="space-y-1.5">
            <Label>{t("project.fromTemplate")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {[{ key: "blank", name: t("project.blank"), color: undefined as string | undefined }, ...options].map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => {
                    setTemplate(o.key);
                    if (o.color) setColor(o.color);
                  }}
                  aria-pressed={template === o.key}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-13 transition-colors",
                    template === o.key ? "border-brand bg-brand-soft text-brand-fg" : "hover:bg-muted",
                  )}
                >
                  {o.key !== "blank" && <Sparkles className="size-3.5" />}
                  {o.name}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>{t("project.visibility")}</Label>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["workspace", Globe, t("project.visibilityWorkspace")],
                  ["private", Lock, t("project.visibilityPrivate")],
                ] as const
              ).map(([v, Icon, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVisibility(v)}
                  aria-pressed={visibility === v}
                  className={cn("flex items-center gap-2 rounded-lg border p-2.5 text-left text-13", visibility === v ? "border-brand bg-brand-soft" : "hover:bg-muted")}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-start">{t("project.startDate")}</Label>
              <Input id="p-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-target">{t("project.targetDate")}</Label>
              <Input id="p-target" type="date" value={target} min={start || undefined} onChange={(e) => setTarget(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-area">
              {t("project.area")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Input id="p-area" value={area} onChange={(e) => setArea(e.target.value)} placeholder={t("project.areaPlaceholder")} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="p-goal">
              {t("project.goal")} <span className="font-normal text-muted-foreground">({t("common.optional")})</span>
            </Label>
            <Textarea id="p-goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder={t("project.goalPlaceholder")} />
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" disabled={!name.trim()}>
              {t("common.create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
