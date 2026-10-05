"use client";

import { ArrowLeft, CheckCircle2, FileUp, Info, Upload } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ProjectDot } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  buildPlan,
  CSV_FIELDS,
  finalizePlan,
  parseCsv,
  parsePlanner,
  readCsvColumns,
  type CsvField,
  type CsvMapping,
  type GroupTarget,
  type ImportPlan,
  type Skipped,
} from "@/lib/import/planner";
import { useFormat } from "@/lib/format";
import { cn } from "@/lib/utils";
import { runImport } from "@/store/actions";
import { useAreas, useCurrentWorkspace, useProjects, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";

type Stage =
  | { kind: "idle" }
  | { kind: "map"; text: string; fileName: string; headers: string[]; sample: Record<string, string>[]; total: number; mapping: CsvMapping }
  | { kind: "review"; plan: ImportPlan; fileName: string }
  | { kind: "done"; added: number; skipped: Skipped[] };

const NONE = "__none__";

/** Import from the old planner (JSON) or a CSV file: map columns, review, import, read the summary. */
export function ImportPanel() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const projects = useProjects(ws?.id, { includeArchived: true });
  const areas = useAreas(ws?.id);
  const allTasks = useStore((s) => s.data.tasks);
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const fileRef = useRef<HTMLInputElement>(null);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [skipDuplicates, setSkipDuplicates] = useState(true);

  const ctx = useMemo(
    () => ({
      existingProjects: projects.map((p) => ({ id: p.id, name: p.name, area_id: p.area_id })),
      existingAreas: areas.map((a) => ({ id: a.id, name: a.name })),
      existingTasks: Object.values(allTasks)
        .filter((x) => !x.deleted_at && x.workspace_id === ws?.id)
        .map((x) => ({ title: x.title, project_id: x.project_id, due_date: x.due_date })),
    }),
    [projects, areas, allTasks, ws?.id],
  );

  async function onFile(file: File) {
    try {
      const text = await file.text();
      if (file.name.toLowerCase().endsWith(".json") || text.trim().startsWith("{")) {
        const { rows, skipped } = parsePlanner(JSON.parse(text), today);
        setStage({ kind: "review", plan: buildPlan("planner", rows, skipped, ctx), fileName: file.name });
      } else {
        const cols = readCsvColumns(text);
        setStage({ kind: "map", text, fileName: file.name, headers: cols.headers, sample: cols.sample, total: cols.total, mapping: cols.guess });
      }
    } catch (e) {
      toast.error(t("settings.importError", { message: (e as Error).message.slice(0, 200) }));
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const reasonText = (r: Skipped["reason"]) => t(`import.reason.${r}`);

  if (!ws) return null;
  const chooser = (
    <>
      <input ref={fileRef} type="file" accept=".json,.csv,application/json,text/csv" hidden onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
      <Button variant="outline" onClick={() => fileRef.current?.click()}>
        <Upload /> {t("settings.importChoose")}
      </Button>
    </>
  );

  if (stage.kind === "idle") {
    return (
      <div className="space-y-2">
        {chooser}
        <p className="text-xs text-muted-foreground">{t("import.formats")}</p>
      </div>
    );
  }

  if (stage.kind === "done") {
    const reasons = Array.from(new Set(stage.skipped.map((s) => s.reason)));
    return (
      <div className="space-y-3" role="status">
        <p className="flex items-start gap-2 text-sm font-medium">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" aria-hidden />
          <span>
            {t("import.summaryAdded", { count: stage.added })}
            {stage.skipped.length > 0 && (
              <>
                {", "}
                {t("import.summarySkipped", { count: stage.skipped.length })} — {reasons.map(reasonText).join(", ")}
              </>
            )}
          </span>
        </p>
        {stage.skipped.length > 0 && (
          <ul className="max-h-40 space-y-0.5 overflow-y-auto rounded-lg border bg-muted/40 p-2 text-xs text-muted-foreground">
            {stage.skipped.map((s) => (
              <li key={`${s.line}-${s.reason}`}>
                {t("import.line", { line: s.line })}: {s.title || "—"} · {reasonText(s.reason)}
              </li>
            ))}
          </ul>
        )}
        <Button variant="outline" onClick={() => setStage({ kind: "idle" })}>
          <FileUp /> {t("import.another")}
        </Button>
      </div>
    );
  }

  if (stage.kind === "map") {
    const { mapping } = stage;
    const setField = (field: CsvField, header: string) => setStage({ ...stage, mapping: { ...mapping, [field]: header === NONE ? undefined : header } });
    return (
      <div className="space-y-4">
        <p className="text-sm">
          <span className="font-medium">{stage.fileName}</span> · {t("import.rows", { count: stage.total })}
        </p>
        <div>
          <p className="mb-2 text-13 font-semibold">{t("import.mapTitle")}</p>
          <div className="grid gap-2 sm:grid-cols-3">
            {CSV_FIELDS.map((field) => (
              <label key={field} className="space-y-1 text-xs">
                <span className="font-medium">
                  {t(`import.field.${field}`)}
                  {field === "title" && <span className="text-danger-fg"> *</span>}
                </span>
                <Select value={mapping[field] ?? NONE} onValueChange={(v) => setField(field, v)}>
                  <SelectTrigger className="h-9 w-full" aria-label={t(`import.field.${field}`)}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("import.notUsed")}</SelectItem>
                    {stage.headers.map((h) => (
                      <SelectItem key={h} value={h}>
                        {h}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </label>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-13 font-semibold">{t("import.previewTitle")}</p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/60 text-left">
                <tr>
                  {CSV_FIELDS.filter((fl) => mapping[fl]).map((fl) => (
                    <th key={fl} scope="col" className="px-2 py-1.5 font-medium whitespace-nowrap">
                      {t(`import.field.${fl}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {stage.sample.map((row, i) => (
                  <tr key={i}>
                    {CSV_FIELDS.filter((fl) => mapping[fl]).map((fl) => (
                      <td key={fl} className="max-w-48 truncate px-2 py-1.5" title={row[mapping[fl]!]}>
                        {row[mapping[fl]!]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setStage({ kind: "idle" })}>
            <ArrowLeft /> {t("common.back")}
          </Button>
          <Button
            disabled={!mapping.title}
            onClick={() => {
              const { rows, skipped } = parseCsv(stage.text, mapping);
              setStage({ kind: "review", plan: buildPlan("csv", rows, skipped, ctx), fileName: stage.fileName });
            }}
          >
            {t("common.continue")}
          </Button>
        </div>
      </div>
    );
  }

  // review
  const { plan } = stage;
  const final = finalizePlan(plan, { skipDuplicates });
  const setTarget = (key: string, target: GroupTarget) => setStage({ ...stage, plan: { ...plan, groups: plan.groups.map((g) => (g.key === key ? { ...g, target } : g)) } });
  const newProjects = plan.groups.filter((g) => g.target.kind === "new").length;
  const newAreas = new Set(plan.groups.flatMap((g) => (g.target.kind === "new" && g.target.area?.kind === "new" ? [g.target.area.name] : []))).size;

  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="font-medium">{stage.fileName}</span> · {t("import.willAdd", { tasks: final.rows.length, projects: newProjects, areas: newAreas })}
      </p>

      {plan.groups.length > 0 && (
        <div className="space-y-2">
          <p className="text-13 font-semibold">{t("import.groupsTitle")}</p>
          <p className="text-xs text-muted-foreground">{t("import.groupsHint")}</p>
          <ul className="divide-y rounded-xl border">
            {plan.groups.map((g) => {
              const target = g.target;
              const value = target.kind === "existing" ? `p:${target.projectId}` : target.kind;
              return (
                <li key={g.key} className="grid gap-2 p-2.5 sm:grid-cols-[1fr_14rem_12rem] sm:items-center">
                  <span className="text-13">
                    <span className="font-medium">{g.label}</span> <span className="text-muted-foreground">· {t("import.tasks", { count: g.count })}</span>
                  </span>
                  <Select
                    value={value}
                    onValueChange={(v) => {
                      if (v === "inbox") setTarget(g.key, { kind: "inbox" });
                      else if (v === "new") setTarget(g.key, { kind: "new", projectName: g.label, color: "sky", area: { kind: "new", name: g.label, color: "sky" } });
                      else setTarget(g.key, { kind: "existing", projectId: v.slice(2) });
                    }}
                  >
                    <SelectTrigger className="h-9 w-full" aria-label={t("import.target", { name: g.label })}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new">{t("import.newProject", { name: g.label })}</SelectItem>
                      <SelectItem value="inbox">{t("nav.inbox")}</SelectItem>
                      {projects.map((p) => (
                        <SelectItem key={p.id} value={`p:${p.id}`}>
                          <ProjectDot color={p.color} size="sm" /> {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {target.kind === "new" ? (
                    <Select
                      value={target.area === null ? NONE : target.area.kind === "existing" ? `a:${target.area.areaId}` : "new"}
                      onValueChange={(v) =>
                        setTarget(g.key, {
                          ...target,
                          area: v === NONE ? null : v === "new" ? { kind: "new", name: g.label, color: target.color } : { kind: "existing", areaId: v.slice(2) },
                        })
                      }
                    >
                      <SelectTrigger className="h-9 w-full" aria-label={t("import.areaFor", { name: g.label })}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="new">{t("import.newArea", { name: g.label })}</SelectItem>
                        <SelectItem value={NONE}>{t("areas.none")}</SelectItem>
                        {areas.map((a) => (
                          <SelectItem key={a.id} value={`a:${a.id}`}>
                            {a.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="hidden sm:block" />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {plan.duplicates.length > 0 && (
        <label className="flex min-h-11 items-center gap-2 rounded-xl border bg-warning-soft/50 px-3 text-13">
          <Checkbox checked={skipDuplicates} onCheckedChange={(v) => setSkipDuplicates(Boolean(v))} />
          {t("import.skipDuplicates", { count: plan.duplicates.length })}
        </label>
      )}

      <div>
        <p className="mb-1.5 text-13 font-semibold">{t("import.previewTitle")}</p>
        <ul className="divide-y rounded-xl border text-13">
          {final.rows.slice(0, 10).map((r) => (
            <li key={r.line} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 px-3 py-1.5">
              <span className={cn("min-w-0 flex-1 break-words", r.status === "done" && "text-muted-foreground line-through")}>{r.title}</span>
              {r.group && <span className="text-xs text-muted-foreground">{r.group}</span>}
              {r.dueDate && <span className="text-xs text-muted-foreground tnum">{f.dayMonth(r.dueDate)}</span>}
            </li>
          ))}
          {final.rows.length > 10 && <li className="px-3 py-1.5 text-xs text-muted-foreground">{t("import.andMore", { count: final.rows.length - 10 })}</li>}
        </ul>
      </div>

      {final.skipped.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("import.willSkip", { count: final.skipped.length })}
        </p>
      )}

      <div className="flex gap-2">
        <Button variant="ghost" onClick={() => setStage({ kind: "idle" })}>
          {t("common.cancel")}
        </Button>
        <Button
          disabled={final.rows.length === 0}
          onClick={() => {
            const res = runImport(plan, ws.id, { skipDuplicates });
            setStage({ kind: "done", ...res });
          }}
        >
          {t("settings.importRun")}
        </Button>
      </div>
    </div>
  );
}
