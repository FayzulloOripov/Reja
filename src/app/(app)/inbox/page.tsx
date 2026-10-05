"use client";

import { Inbox, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { Kbd, PageHeader } from "@/components/common/bits";
import { PageContainer } from "@/components/shell/app-client";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { byPosition } from "@/lib/filters";
import { isOpen } from "@/lib/health";
import { updateTask } from "@/store/actions";
import { useMyTasks } from "@/store/hooks";
import { useUI } from "@/store/ui";

export default function InboxPage() {
  const t = useTranslations("inbox");
  const tc = useTranslations();
  const mine = useMyTasks();
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const tasks = useMemo(() => mine.filter((x) => !x.project_id && isOpen(x)).sort(byPosition), [mine]);

  return (
    <PageContainer>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-info-soft text-info-fg"><Inbox className="size-5" /></span>}
        actions={
          <Button onClick={() => openQuickAdd({ projectId: null })} size="sm">
            <Plus /> {tc("nav.newTask")}
          </Button>
        }
      />
      {tasks.length > 0 && (
        <p className="mb-3 hidden items-center gap-1 text-xs text-muted-foreground md:flex">
          {t("triageHint").split(" · ").map((part) => {
            const [key, ...rest] = part.split(" ");
            return (
              <span key={part} className="mr-2 inline-flex items-center gap-1">
                <Kbd>{key}</Kbd> {rest.join(" ")}
              </span>
            );
          })}
        </p>
      )}
      <div className="rounded-2xl border bg-card p-2 shadow-elev-1">
        <TaskList
          triage
          sortable
          allowAdd
          groups={[{ key: "inbox", tasks, defaults: { projectId: null }, collapsible: false }]}
          onMove={(task, _g, position) => updateTask(task.id, { position })}
        />
        {tasks.length === 0 && <EmptyState illustration="inbox" title={t("empty")} body={t("emptyBody")} />}
      </div>
    </PageContainer>
  );
}
