"use client";

import { Banknote, FileText, Filter } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { UserAvatar } from "@/components/common/bits";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useFormat } from "@/lib/format";
import type { Workspace, WorkspaceModules } from "@/lib/types";
import { setModule, updateMoneySettings } from "@/store/business-actions";
import { useMembers, useToday, useTz } from "@/store/hooks";
import { SettingsCard, SettingsRow } from "./common";

const MODULES: { key: keyof WorkspaceModules; icon: typeof Filter }[] = [
  { key: "pipeline", icon: Filter },
  { key: "money", icon: Banknote },
  { key: "docs", icon: FileText },
];

/** Business modules, switched on per workspace by its admins. */
export function ModulesCard({ ws, admin }: { ws: Workspace; admin: boolean }) {
  const t = useTranslations();
  return (
    <SettingsCard title={t("modules.title")} description={t("modules.hint")}>
      {MODULES.map(({ key, icon: Icon }) => (
        <SettingsRow
          key={key}
          label={
            <span className="inline-flex items-center gap-2">
              <Icon className="size-4 text-muted-foreground" /> {t(`modules.${key}`)}
            </span>
          }
          description={t(`modules.${key}Hint`)}
        >
          <Switch checked={Boolean(ws.modules?.[key])} disabled={!admin} onCheckedChange={(v) => setModule(ws, key, v)} aria-label={t(`modules.${key}`)} />
        </SettingsRow>
      ))}
    </SettingsCard>
  );
}

/** Exchange rate, approval threshold and the partner split rule. */
export function MoneySettingsCard({ ws, admin }: { ws: Workspace; admin: boolean }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const members = useMembers(ws.id).filter((m) => m.role !== "guest");
  const [rate, setRate] = useState(String(ws.usd_rate));
  const [threshold, setThreshold] = useState(ws.approval_threshold_uzs ? String(ws.approval_threshold_uzs) : "");
  const split = ws.money_split;
  const [fund, setFund] = useState(String(split?.fund_pct ?? 10));
  const even = members.length ? Math.round(100 / members.length) : 50;
  const [shares, setShares] = useState<Record<string, string>>(() =>
    Object.fromEntries(members.map((m) => [m.id, String(split?.shares?.[m.id] ?? even)])),
  );
  const num = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));
  const saveSplit = (on: boolean) => {
    if (!on) return updateMoneySettings(ws, { money_split: null });
    const sh = Object.fromEntries(members.map((m) => [m.id, num(shares[m.id] ?? String(even))]).filter(([, v]) => Number(v) > 0));
    updateMoneySettings(ws, { money_split: { fund_pct: Math.max(0, Math.min(100, num(fund) || 0)), shares: sh } });
  };
  const total = members.reduce((n, m) => n + (num(shares[m.id] ?? "0") || 0), 0);

  return (
    <SettingsCard title={t("money.settings")} description={t("money.settingsHint")}>
      <SettingsRow label={t("money.rate")} description={t("money.rateHint")} htmlFor="m-rate">
        <Input
          id="m-rate"
          inputMode="decimal"
          className="w-36 tnum"
          value={rate}
          disabled={!admin}
          onChange={(e) => setRate(e.target.value)}
          onBlur={() => num(rate) > 0 && num(rate) !== ws.usd_rate && updateMoneySettings(ws, { usd_rate: num(rate) })}
        />
        <span className="text-13 text-muted-foreground">{t("money.perUsd")}</span>
      </SettingsRow>
      <SettingsRow label={t("money.threshold")} description={t("money.thresholdHint")} htmlFor="m-threshold">
        <Input
          id="m-threshold"
          inputMode="decimal"
          className="w-40 tnum"
          placeholder={t("money.thresholdOff")}
          value={threshold}
          disabled={!admin}
          onChange={(e) => setThreshold(e.target.value)}
          onBlur={() => {
            const v = threshold.trim() ? num(threshold) : null;
            if (v !== ws.approval_threshold_uzs && (v === null || v > 0)) updateMoneySettings(ws, { approval_threshold_uzs: v });
          }}
        />
        <span className="text-13 text-muted-foreground">soʻm</span>
      </SettingsRow>
      <SettingsRow label={t("money.split")} description={t("money.splitHint")}>
        <Switch checked={Boolean(split)} disabled={!admin || members.length < 2} onCheckedChange={saveSplit} aria-label={t("money.split")} />
      </SettingsRow>
      {split && (
        <div className="space-y-2.5 px-5 py-3.5">
          <label className="flex items-center gap-2 text-sm">
            <span className="w-40 text-muted-foreground">{t("money.fundPct")}</span>
            <Input inputMode="decimal" className="w-20 tnum" value={fund} disabled={!admin} onChange={(e) => setFund(e.target.value)} onBlur={() => saveSplit(true)} aria-label={t("money.fundPct")} />
            <span className="text-muted-foreground">%</span>
          </label>
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-2 text-sm">
              <span className="flex w-40 items-center gap-1.5 truncate"><UserAvatar profile={m} size={20} /> {m.name}</span>
              <Input
                inputMode="decimal"
                className="w-20 tnum"
                value={shares[m.id] ?? ""}
                disabled={!admin}
                onChange={(e) => setShares({ ...shares, [m.id]: e.target.value })}
                onBlur={() => saveSplit(true)}
                aria-label={t("money.shareOf", { name: m.name })}
              />
              <span className="text-muted-foreground">%</span>
            </label>
          ))}
          {total !== 100 && <p className="text-xs text-warning-fg">{t("money.sharesNot100", { total: f.num(total) })}</p>}
        </div>
      )}
    </SettingsCard>
  );
}
