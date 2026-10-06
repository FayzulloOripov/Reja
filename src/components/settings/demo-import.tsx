"use client";

import { FlaskConical, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useIsDemo } from "@/hooks/use-demo";
import { planDemoImport, type Snapshot } from "@/lib/demo/import";
import { DEMO_USER_ID } from "@/lib/demo/seed";
import { cn } from "@/lib/utils";
import { uuid } from "@/store/factories";
import { useCurrentWorkspace, useUserId } from "@/store/hooks";
import { updateWorkspace } from "@/store/actions";
import { deleteSnapshots, mutate, readSnapshot, useStore, type MutationInput } from "@/store/store";
import type { TableName } from "@/store/tables";

/**
 * After sign-up: offers to move what was typed in the demo (still in this browser) into the account.
 * Renders nothing when there is no demo data or while the demo itself is open.
 */
export function DemoImportCard({ className }: { className?: string }) {
  const t = useTranslations("demoImport");
  const demo = useIsDemo();
  const uid = useUserId();
  const ws = useCurrentWorkspace();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [mode, setMode] = useState<"mine" | "all">("mine");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");

  useEffect(() => {
    if (demo) return;
    let alive = true;
    void readSnapshot(DEMO_USER_ID).then((s) => alive && setSnap(s as unknown as Snapshot | null));
    return () => {
      alive = false;
    };
  }, [demo]);

  const plan = useMemo(() => (snap && ws && uid ? planDemoImport(snap, { userId: uid, workspaceId: ws.id, mode, newId: uuid }) : null), [snap, ws, uid, mode]);

  if (demo || !snap || !plan || state === "done") return null;
  const mine = planDemoImport(snap, { userId: uid, workspaceId: ws!.id, mode: "mine", newId: () => "x" }).summary;

  return (
    <section className={cn("space-y-3 rounded-2xl border bg-info-soft/50 p-4", className)}>
      <h2 className="flex items-center gap-2 font-sans text-base font-semibold tracking-normal">
        <FlaskConical className="size-4 text-info" aria-hidden /> {t("title")}
      </h2>
      <p className="text-13 text-muted-foreground">{t("body")}</p>
      <div role="radiogroup" aria-label={t("title")} className="grid gap-2 sm:grid-cols-2">
        {(["mine", "all"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="radio"
            aria-checked={mode === m}
            onClick={() => setMode(m)}
            className={cn("min-h-11 rounded-xl border px-3 py-2 text-left text-13", mode === m ? "border-brand bg-card" : "bg-card/60 hover:bg-card")}
          >
            <span className="block font-medium">{t(m)}</span>
            <span className="block text-xs text-muted-foreground">{m === "mine" ? t("mineHint", { tasks: mine.tasks }) : t("allHint")}</span>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">{t("summary", { projects: plan.summary.projects, tasks: plan.summary.tasks })}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={plan.items.length === 0 || state === "busy"}
          onClick={async () => {
            setState("busy");
            // every item is a new row in the account (new ids), written in dependency order
            mutate(plan.items.map((i): MutationInput => ({ table: i.table as TableName, kind: i.kind, row: i.row })));
            // switch on the business modules the imported data uses
            const target = ws ? useStore.getState().data.workspaces[ws.id] : undefined;
            if (target) {
              const used = { pipeline: plan.items.some((i) => i.table === "deals"), money: plan.items.some((i) => i.table === "money_entries"), docs: plan.items.some((i) => i.table === "note_tasks") };
              if (Object.entries(used).some(([k, on]) => on && !target.modules?.[k as keyof typeof used])) {
                updateWorkspace(target.id, { modules: { ...target.modules, ...Object.fromEntries(Object.entries(used).filter(([, on]) => on)) } });
              }
            }
            await deleteSnapshots(DEMO_USER_ID);
            setState("done");
            toast.success(t("done", { tasks: plan.summary.tasks }));
          }}
        >
          {state === "busy" && <Loader2 className="animate-spin" />} {t("run")}
        </Button>
        <Button
          variant="ghost"
          onClick={async () => {
            await deleteSnapshots(DEMO_USER_ID);
            setSnap(null);
          }}
        >
          {t("discard")}
        </Button>
      </div>
    </section>
  );
}
