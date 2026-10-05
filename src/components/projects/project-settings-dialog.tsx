"use client";

import { Copy, Send, Unplug } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { TELEGRAM_BOT_USERNAME } from "@/lib/env";
import type { Project, ProjectStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { updateProject } from "@/store/actions";
import { uuid } from "@/store/factories";
import { ColorPicker } from "../tasks/pickers";

export function ProjectSettingsDialog({ project, open, onOpenChange, manager }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void; manager: boolean }) {
  const t = useTranslations();
  const [form, setForm] = useState(project);
  useEffect(() => {
    if (open) setForm(project);
  }, [open, project]);

  function save() {
    const values: Partial<Project> = {
      name: form.name.trim() || project.name,
      color: form.color,
      status: form.status,
      start_date: form.start_date || null,
      target_date: form.target_date || null,
      goal: form.goal || null,
      area: form.area || null,
    };
    if (manager) values.visibility = form.visibility;
    updateProject(project.id, values);
    toast.success(t("common.saved"));
    onOpenChange(false);
  }

  const code = project.telegram_link_code;
  const command = code ? `/ulash ${code}` : "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("common.settings")}</DialogTitle>
          <DialogDescription className="sr-only">{project.name}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ps-name">{t("common.name")}</Label>
            <Input id="ps-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.color")}</Label>
            <ColorPicker value={form.color} onChange={(c) => setForm({ ...form, color: c })} />
          </div>
          <div className="space-y-1.5">
            <Label>{t("common.status")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["active", "paused", "done", "archived"] as ProjectStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={form.status === s}
                  onClick={() => setForm({ ...form, status: s })}
                  className={cn("h-8 rounded-lg border px-3 text-13", form.status === s ? "border-brand bg-brand-soft text-brand-fg" : "hover:bg-muted")}
                >
                  {t(`projectStatus.${s}`)}
                </button>
              ))}
            </div>
          </div>
          {manager && (
            <div className="space-y-1.5">
              <Label>{t("project.visibility")}</Label>
              <div className="flex flex-wrap gap-1.5">
                {(["workspace", "private"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    aria-pressed={form.visibility === v}
                    onClick={() => setForm({ ...form, visibility: v })}
                    className={cn("h-8 rounded-lg border px-3 text-13", form.visibility === v ? "border-brand bg-brand-soft text-brand-fg" : "hover:bg-muted")}
                  >
                    {v === "workspace" ? t("project.visibilityWorkspace") : t("project.visibilityPrivate")}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ps-start">{t("project.startDate")}</Label>
              <Input id="ps-start" type="date" value={form.start_date ?? ""} onChange={(e) => setForm({ ...form, start_date: e.target.value || null })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ps-target">{t("project.targetDate")}</Label>
              <Input id="ps-target" type="date" value={form.target_date ?? ""} onChange={(e) => setForm({ ...form, target_date: e.target.value || null })} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-area">{t("project.area")}</Label>
            <Input id="ps-area" value={form.area ?? ""} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder={t("project.areaPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ps-goal">{t("project.goal")}</Label>
            <Textarea id="ps-goal" rows={2} value={form.goal ?? ""} onChange={(e) => setForm({ ...form, goal: e.target.value })} placeholder={t("project.goalPlaceholder")} />
          </div>

          {manager && (
            <div className="space-y-2 rounded-xl border bg-muted/40 p-3">
              <p className="flex items-center gap-2 text-13 font-semibold">
                <Send className="size-4 text-info" /> {t("project.telegramGroup")}
              </p>
              {project.telegram_chat_id ? (
                <div className="flex items-center justify-between gap-2">
                  <p className="text-13 text-muted-foreground">{t("project.telegramGroupConnected")}</p>
                  <Button size="sm" variant="outline" onClick={() => updateProject(project.id, { telegram_chat_id: null })}>
                    <Unplug /> {t("project.telegramGroupDisconnect")}
                  </Button>
                </div>
              ) : code ? (
                <div className="space-y-1.5">
                  <p className="text-13 text-muted-foreground">
                    {t("project.telegramGroupHint")} {TELEGRAM_BOT_USERNAME && <span className="font-medium">@{TELEGRAM_BOT_USERNAME}</span>}
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md bg-card px-2.5 py-1.5 font-mono text-sm">{command}</code>
                    <Button size="icon-sm" variant="outline" onClick={() => { void navigator.clipboard.writeText(command); toast.success(t("common.copied")); }} aria-label={t("common.copy")}>
                      <Copy />
                    </Button>
                  </div>
                </div>
              ) : (
                <Button size="sm" variant="outline" onClick={() => updateProject(project.id, { telegram_link_code: uuid().replace(/-/g, "").slice(0, 10).toUpperCase() })}>
                  {t("settings.telegramConnect")}
                </Button>
              )}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={save}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
