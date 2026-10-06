"use client";

import { Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormat } from "@/lib/format";
import { moneyLabel, needsApproval, toUzs } from "@/lib/money";
import type { Currency, MoneyEntry, Workspace } from "@/lib/types";
import { createMoneyEntry, updateMoneyEntry } from "@/store/business-actions";
import { useMembers, useProjects, useToday, useTz, useUserId } from "@/store/hooks";

const NONE = "none";

export function MoneyDialog({ ws, entry, kind, onClose }: { ws: Workspace; entry: MoneyEntry | null; kind: MoneyEntry["kind"]; onClose: () => void }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const uid = useUserId();
  const projects = useProjects(ws.id);
  const members = useMembers(ws.id).filter((m) => m.role !== "guest");
  const [form, setForm] = useState({
    kind: entry?.kind ?? kind,
    amount: entry ? String(entry.amount) : "",
    currency: (entry?.currency ?? "UZS") as Currency,
    rate: entry?.rate ? String(entry.rate) : String(ws.usd_rate),
    date: entry?.date ?? today,
    method: entry?.method ?? "cash",
    project_id: entry?.project_id ?? NONE,
    partner_id: entry?.partner_id ?? uid,
    category: entry?.category ?? "",
    note: entry?.note ?? "",
    direct: entry?.direct ?? false,
  });
  const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
  const amount = num(form.amount);
  const valid = Number.isFinite(amount) && amount > 0 && (form.currency === "UZS" || num(form.rate) > 0);
  const uzs = valid ? toUzs({ amount, currency: form.currency, rate: num(form.rate) }) : 0;
  const approval = valid && needsApproval(form.kind, uzs, ws.approval_threshold_uzs);
  const set = <K extends keyof typeof form>(k: K) => (v: (typeof form)[K]) => setForm({ ...form, [k]: v });

  const save = () => {
    if (!valid) return;
    const values = {
      kind: form.kind,
      amount,
      currency: form.currency,
      rate: form.currency === "USD" ? num(form.rate) : null,
      date: form.date || today,
      method: form.method as MoneyEntry["method"],
      project_id: form.project_id === NONE ? null : form.project_id,
      partner_id: form.partner_id === NONE ? null : form.partner_id,
      category: form.category.trim() || null,
      note: form.note.trim() || null,
      direct: form.kind === "expense" && form.direct,
    };
    if (entry) updateMoneyEntry(entry, values, ws);
    else createMoneyEntry(ws, values);
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{entry ? t("money.editEntry") : form.kind === "income" ? t("money.addIncome") : t("money.addExpense")}</DialogTitle>
        </DialogHeader>
        <form
          id="money-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid grid-cols-[1fr_auto] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mo-amount">{t("money.amount")}</Label>
              <Input id="mo-amount" autoFocus inputMode="decimal" className="tnum" value={form.amount} onChange={(e) => set("amount")(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mo-currency">{t("money.currency")}</Label>
              <Select value={form.currency} onValueChange={(v) => set("currency")(v as Currency)}>
                <SelectTrigger id="mo-currency" className="w-24"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="UZS">UZS</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {form.currency === "USD" && (
            <div className="space-y-1.5">
              <Label htmlFor="mo-rate">{t("money.rate")}</Label>
              <Input id="mo-rate" inputMode="decimal" className="tnum" value={form.rate} onChange={(e) => set("rate")(e.target.value)} />
              {valid && <p className="text-xs text-muted-foreground tnum">= {moneyLabel(f.num, uzs)}</p>}
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="mo-date">{t("meetings.date")}</Label>
              <Input id="mo-date" type="date" value={form.date} onChange={(e) => set("date")(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mo-method">{t("money.method")}</Label>
              <Select value={form.method} onValueChange={(v) => set("method")(v as MoneyEntry["method"])}>
                <SelectTrigger id="mo-method" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(["cash", "card", "transfer"] as const).map((m) => <SelectItem key={m} value={m}>{t(`money.methods.${m}`)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mo-project">{t("task.project")}</Label>
              <Select value={form.project_id} onValueChange={set("project_id")}>
                <SelectTrigger id="mo-project" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("meetings.noProject")}</SelectItem>
                  {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mo-partner">{form.kind === "income" ? t("money.receivedBy") : t("money.paidBy")}</Label>
              <Select value={form.partner_id ?? NONE} onValueChange={set("partner_id")}>
                <SelectTrigger id="mo-partner" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("money.fund")}</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mo-category">{t("money.category")}</Label>
            <Input id="mo-category" value={form.category} onChange={(e) => set("category")(e.target.value)} maxLength={60} placeholder={t("money.categoryPlaceholder")} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mo-note">{t("contacts.note")}</Label>
            <Input id="mo-note" value={form.note} onChange={(e) => set("note")(e.target.value)} maxLength={500} />
          </div>
          {form.kind === "expense" && (
            <label className="flex items-start gap-2.5 text-sm">
              <Checkbox className="mt-0.5" checked={form.direct} onCheckedChange={(v) => set("direct")(v === true)} />
              <span>
                {t("money.directLabel")}
                <span className="block text-xs text-muted-foreground">{t("money.directHint")}</span>
              </span>
            </label>
          )}
          {approval && (
            <p className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2 text-13 text-warning-fg" role="status">
              <Clock className="mt-0.5 size-4 shrink-0" /> {t("money.needsApproval", { amount: moneyLabel(f.num, Number(ws.approval_threshold_uzs)) })}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" form="money-form" disabled={!valid}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
