"use client";

import { useTranslations } from "next-intl";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useTask } from "@/store/hooks";
import { useUI } from "@/store/ui";
import { TaskDetail } from "./task-detail";

/** Task detail: side panel on desktop, full-screen sheet on mobile. */
export function TaskPanel() {
  const t = useTranslations("task");
  const id = useUI((s) => s.taskPanelId);
  const openTask = useUI((s) => s.openTask);
  const task = useTask(id);
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && openTask(null)} modal={false}>
      <SheetContent
        side="right"
        showCloseButton={false}
        data-task-panel
        onInteractOutside={(e) => {
          // keep the panel open while using popovers, toasts and the list behind it
          const target = e.target as HTMLElement;
          if (target.closest("[data-radix-popper-content-wrapper],[data-sonner-toaster],[data-task-id],[role=dialog]")) e.preventDefault();
        }}
        className="w-full gap-0 overflow-y-auto p-0 shadow-elev-4 data-[side=right]:w-full data-[side=right]:sm:max-w-[560px]"
      >
        <SheetTitle className="sr-only">{task?.title ?? t("titlePlaceholder")}</SheetTitle>
        <SheetDescription className="sr-only">{t("titlePlaceholder")}</SheetDescription>
        {id && <TaskDetail key={id} taskId={id} onClose={() => openTask(null)} />}
      </SheetContent>
    </Sheet>
  );
}
