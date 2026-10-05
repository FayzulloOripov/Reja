"use client";

import { BarChart3, Download, Table2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { downloadText, toCSV } from "@/lib/csv";
import { cn } from "@/lib/utils";

/** Categorical slots in fixed order (see globals.css). Never cycled past 8. */
export const SLOT = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)"];

export const axisTick = { fill: "var(--muted-foreground)", fontSize: 11 };
export const axisProps = { tick: axisTick, axisLine: false, tickLine: false } as const;
export const gridProps = { stroke: "var(--chart-grid)", strokeDasharray: "", vertical: false } as const;
/** Bars: ≤ 24px thick, 4px rounded data-end, square at the baseline. */
export const barProps = { maxBarSize: 24, radius: [4, 4, 0, 0] as [number, number, number, number] };
export const hbarProps = { maxBarSize: 20, radius: [0, 4, 4, 0] as [number, number, number, number] };
/** Lines: 2px, round joins; end markers ≥ 8px with a 2px surface ring. */
export const lineProps = {
  strokeWidth: 2,
  strokeLinejoin: "round" as const,
  strokeLinecap: "round" as const,
  dot: false,
  activeDot: { r: 5, strokeWidth: 2, stroke: "var(--card)" },
  type: "monotone" as const,
};

export interface LegendItem {
  label: string;
  color: string;
  kind: "bar" | "line";
}

export function Legend({ items }: { items: LegendItem[] }) {
  if (items.length < 2) return null;
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          {i.kind === "bar" ? <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} /> : <span className="h-0.5 w-3.5 rounded-full" style={{ background: i.color }} />}
          {i.label}
        </li>
      ))}
    </ul>
  );
}

interface TipPayload {
  name?: string;
  value?: number | string;
  color?: string;
  dataKey?: string | number;
  payload?: Record<string, unknown>;
}

/** Values lead, labels follow; series keyed with a short line in the series color. */
export function ChartTooltip({
  active,
  payload,
  label,
  format,
  labelFormat,
}: {
  active?: boolean;
  payload?: TipPayload[];
  label?: string | number;
  format?: (v: number, name?: string) => string;
  labelFormat?: (l: string | number) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="min-w-36 rounded-lg border bg-popover px-3 py-2 text-xs shadow-elev-3">
      {label !== undefined && <p className="mb-1.5 font-medium text-muted-foreground">{labelFormat ? labelFormat(label) : label}</p>}
      <ul className="space-y-1">
        {payload.map((p) => (
          <li key={String(p.dataKey ?? p.name)} className="flex items-center gap-2">
            <span className="h-0.5 w-3 shrink-0 rounded-full" style={{ background: p.color }} />
            <span className="font-semibold text-foreground tnum">{typeof p.value === "number" && format ? format(p.value, p.name) : p.value}</span>
            <span className="text-muted-foreground">{p.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface TableSpec {
  columns: { key: string; label: string; numeric?: boolean }[];
  rows: Record<string, string | number>[];
}

/** Card with a chart/table toggle and CSV export, so no value is gated behind hover. */
export function ChartCard({
  title,
  subtitle,
  legend,
  table,
  csvName,
  children,
  className,
  height = 220,
}: {
  title: string;
  subtitle?: ReactNode;
  legend?: LegendItem[];
  table: TableSpec;
  csvName: string;
  children: ReactNode;
  className?: string;
  height?: number;
}) {
  const t = useTranslations("common");
  const [asTable, setAsTable] = useState(false);
  return (
    <section className={cn("rounded-2xl border bg-card p-4 shadow-elev-1", className)}>
      <header className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-sans text-sm font-semibold tracking-normal">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" size="icon-sm" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable} aria-label={asTable ? "chart" : "table"}>
            {asTable ? <BarChart3 /> : <Table2 />}
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label={t("downloadCsv")} onClick={() => downloadText(`${csvName}.csv`, toCSV(table.rows, table.columns.map((c) => c.key)))}>
            <Download />
          </Button>
        </div>
      </header>
      {legend && <div className="mb-2"><Legend items={legend} /></div>}
      {asTable ? (
        <div className="overflow-auto" style={{ maxHeight: height + 20 }}>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                {table.columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("px-2 py-1.5 font-medium", c.numeric ? "text-right" : "text-left")}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {table.rows.map((r, i) => (
                <tr key={i}>
                  {table.columns.map((c) => (
                    <td key={c.key} className={cn("px-2 py-1.5", c.numeric && "text-right tnum")}>{r[c.key]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ height }} role="img" aria-label={title}>
          {children}
        </div>
      )}
    </section>
  );
}

export function StatTile({ label, value, delta, hint, icon }: { label: string; value: ReactNode; delta?: { value: number; goodWhenUp: boolean } | null; hint?: ReactNode; icon?: ReactNode }) {
  const good = delta ? (delta.value >= 0) === delta.goodWhenUp : null;
  return (
    <div className="rounded-2xl border bg-card p-4 shadow-elev-1">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground [&_svg]:size-3.5">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 flex items-baseline gap-2 text-28 leading-none font-semibold tnum">
        {value}
        {delta && delta.value !== 0 && (
          <span className={cn("text-xs font-semibold", good ? "text-success-fg" : "text-danger-fg")}>
            {delta.value > 0 ? "+" : ""}
            {delta.value}
          </span>
        )}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
