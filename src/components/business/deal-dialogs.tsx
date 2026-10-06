"use client";

import { FolderPlus, History, Trash2, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useFormat } from "@/lib/format";
import { BUILTIN_TEMPLATES } from "@/lib/templates";
import type { Currency, Deal, DealStage, ProjectTemplateData, Workspace } from "@/lib/types";
import { createDeal, dealToProject, deleteDeal, moveDeal, updateDeal } from "@/store/business-actions";
import { useContacts, useMembers, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";

const NONE = "none";

export function DealDialog({
  ws,
  deal,
  stages,
  onClose,
  onMove,
  onConvert,
}: {
  ws: Workspace;
  deal: Deal | null;
  stages: DealStage[];
  onClose: () => void;
  onMove: (deal: Deal, stage: DealStage) => void;
  onConvert: (deal: Deal) => void;
}) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const members = useMembers(ws.id).filter((m) => m.role !== "guest");
  const contacts = useContacts(ws.id);
  const history = useStore((s) => s.data.deal_stage_history);
  const profiles = useStore((s) => s.data.profiles);
  const firstOpen = stages.find((s) => s.kind === "open") ?? stages[0];
  const [form, setForm] = useState({
    title: deal?.title ?? "",
    value: deal?.value != null ? String(deal.value) : "",
    currency: (deal?.currency ?? "UZS") as Currency,
    stage_id: deal?.stage_id ?? firstOpen?.id ?? "",
    owner_id: deal?.owner_id ?? NONE,
    contact_id: deal?.contact_id ?? NONE,
    source: deal?.source ?? "",
    next_step: deal?.next_step ?? "",
    next_step_date: deal?.next_step_date ?? "",
    lost_reason: deal?.lost_reason ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const stage = stages.find((s) => s.id === form.stage_id);
  const set = (k: keyof typeof form) => (v: string) => setForm({ ...form, [k]: v });
  const moves = useMemo(
    () => (deal ? Object.values(history).filter((h) => h.deal_id === deal.id).sort((a, b) => b.changed_at.localeCompare(a.changed_at)) : []),
    [history, deal],
  );
  const stageName = (id: string | null) => stages.find((s) => s.id === id)?.name ?? "—";

  const save = () => {
    if (!form.title.trim() || !stage) return;
    if (stage.kind === "lost" && !form.lost_reason.trim()) {
      setError(t("pipeline.lostReasonRequired"));
      return;
    }
    const num = Number(form.value.replace(/\s/g, "").replace(",", "."));
    const values = {
      title: form.title.trim(),
      value: form.value.trim() && Number.isFinite(num) ? num : null,
      currency: form.currency,
      owner_id: form.owner_id === NONE ? null : form.owner_id,
      contact_id: form.contact_id === NONE ? null : form.contact_id,
      source: form.source.trim() || null,
      next_step: form.next_step.trim() || null,
      next_step_date: form.next_step_date || null,
      lost_reason: form.lost_reason.trim() || null,
    };
    if (!deal) {
      createDeal(ws.id, { ...values, stage_id: stage.id, closed_at: stage.kind === "open" ? null : new Date().toISOString() });
    } else {
      updateDeal(deal.id, values);
      if (stage.id !== deal.stage_id) {
        if (stage.kind === "lost") moveDeal({ ...deal, ...values }, stage, values.lost_reason ?? undefined);
        else onMove({ ...deal, ...values }, stage);
      }
    }
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{deal ? t("pipeline.editDeal") : t("pipeline.newDeal")}</DialogTitle>
        </DialogHeader>
        <form
          id="deal-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="d-title">{t("pipeline.dealTitle")}</Label>
            <Input id="d-title" autoFocus value={form.title} onChange={(e) => set("title")(e.target.value)} maxLength={200} required />
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-value">{t("pipeline.value")}</Label>
              <Input id="d-value" inputMode="decimal" className="tnum" value={form.value} onChange={(e) => set("value")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-currency">{t("money.currency")}</Label>
              <Select value={form.currency} onValueChange={set("currency")}>
                <SelectTrigger id="d-currency" className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UZS">UZS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="d-stage">{t("pipeline.stage")}</Label>
              <Select value={form.stage_id} onValueChange={set("stage_id")}>
                <SelectTrigger id="d-stage" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-owner">{t("pipeline.owner")}</Label>
              <Select value={form.owner_id} onValueChange={set("owner_id")}>
                <SelectTrigger id="d-owner" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-contact">{t("pipeline.contact")}</Label>
              <Select value={form.contact_id} onValueChange={set("contact_id")}>
                <SelectTrigger id="d-contact" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-source">{t("pipeline.source")}</Label>
              <Input id="d-source" value={form.source} onChange={(e) => set("source")(e.target.value)} maxLength={80} placeholder={t("pipeline.sourcePlaceholder")} />
            </div>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="d-next">{t("pipeline.nextStep")}</Label>
              <Input id="d-next" value={form.next_step} onChange={(e) => set("next_step")(e.target.value)} maxLength={300} placeholder={t("pipeline.nextStepPlaceholder")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="d-next-date">{t("pipeline.nextStepDate")}</Label>
              <Input id="d-next-date" type="date" value={form.next_step_date} onChange={(e) => set("next_step_date")(e.target.value)} />
            </div>
          </div>
          {stage?.kind === "lost" && (
            <div className="space-y-1.5">
              <Label htmlFor="d-lost">{t("pipeline.lostReason")}</Label>
              <Textarea id="d-lost" rows={2} value={form.lost_reason} onChange={(e) => set("lost_reason")(e.target.value)} maxLength={500} aria-invalid={Boolean(error)} />
              {error && <p className="text-13 text-danger-fg" role="alert">{error}</p>}
            </div>
          )}
        </form>
        {moves.length > 0 && (
          <section aria-labelledby="d-history" className="rounded-xl bg-muted/50 px-3 py-2.5">
            <h3 id="d-history" className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><History className="size-3.5" /> {t("pipeline.history")}</h3>
            <ol className="space-y-1 text-xs">
              {moves.map((h) => (
                <li key={h.id} className="flex gap-2 tnum">
                  <span className="text-muted-foreground">{f.dayMonth(h.changed_at.slice(0, 10))}</span>
                  <span>{h.from_stage_id ? `${stageName(h.from_stage_id)} → ${stageName(h.to_stage_id)}` : t("pipeline.createdIn", { stage: stageName(h.to_stage_id) })}</span>
                  {h.changed_by && <span className="text-muted-foreground">· {profiles[h.changed_by]?.name}</span>}
                </li>
              ))}
            </ol>
          </section>
        )}
        <DialogFooter className="gap-2 sm:justify-between">
          {deal ? (
            <div className="flex gap-1">
              <Button variant="ghost" className="text-destructive" onClick={() => { deleteDeal(deal); onClose(); }}>
                <Trash2 /> {t("common.delete")}
              </Button>
              {stage?.kind === "won" && !deal.project_id && (
                <Button variant="ghost" onClick={() => { onClose(); onConvert(deal); }}>
                  <FolderPlus /> {t("pipeline.toProject")}
                </Button>
              )}
            </div>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" form="deal-form" disabled={!form.title.trim()}>{t("common.save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Moving to a lost stage asks why (the database requires it). */
export function LostDialog({ deal, stage, onClose }: { deal: Deal; stage: DealStage; onClose: () => void }) {
  const t = useTranslations();
  const [reason, setReason] = useState(deal.lost_reason ?? "");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("pipeline.lostTitle", { title: deal.title })}</DialogTitle>
          <DialogDescription>{t("pipeline.lostBody")}</DialogDescription>
        </DialogHeader>
        <form
          id="lost-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return;
            moveDeal(deal, stage, reason);
            onClose();
          }}
        >
          <Label htmlFor="lost-reason" className="sr-only">{t("pipeline.lostReason")}</Label>
          <Textarea id="lost-reason" autoFocus rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("pipeline.lostPlaceholder")} />
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="lost-form" disabled={!reason.trim()}>{t("pipeline.markLost")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A won deal becomes a project, optionally from a template. */
export function ToProjectDialog({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const me = useStore((s) => s.data.profiles[s.userId ?? ""]);
  const lang = me?.language === "en" ? "en" : "uz";
  const templates = useStore((s) => s.data.templates);
  const own = useMemo(() => Object.values(templates).filter((x) => x.workspace_id === deal.workspace_id && x.kind === "project"), [templates, deal.workspace_id]);
  const [choice, setChoice] = useState(NONE);
  const options: { key: string; name: string; data?: ProjectTemplateData }[] = [
    { key: NONE, name: t("pipeline.emptyProject") },
    ...BUILTIN_TEMPLATES.map((b) => ({ key: `b:${b.key}`, name: b.name[lang], data: b.data[lang] })),
    ...own.map((o) => ({ key: `w:${o.id}`, name: o.name, data: o.data as ProjectTemplateData })),
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Trophy className="size-5 text-success" /> {t("pipeline.wonTitle", { title: deal.title })}</DialogTitle>
          <DialogDescription>{t("pipeline.wonBody")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="tp-template">{t("pipeline.template")}</Label>
          <Select value={choice} onValueChange={setChoice}>
            <SelectTrigger id="tp-template" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {options.map((o) => <SelectItem key={o.key} value={o.key}>{o.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("pipeline.later")}</Button>
          <Button
            onClick={() => {
              const project = dealToProject(deal, options.find((o) => o.key === choice)?.data);
              onClose();
              router.push(`/projects/${project.id}`);
            }}
          >
            <FolderPlus /> {t("pipeline.createProject")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
