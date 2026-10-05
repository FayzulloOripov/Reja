"use client";

import { CalendarDays, CheckCheck, FolderInput, Tag, Trash2, UserPlus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { bulkAssign, bulkLabel, completeTasks, deleteTasks, moveTasks, rescheduleTasks } from "@/store/actions";
import { useCurrentWorkspace, useLabels, useMembers } from "@/store/hooks";
import { useUI } from "@/store/ui";
import { AssigneePicker, DatePicker, LabelPicker, ProjectPicker } from "./pickers";

export function BulkBar() {
  const t = useTranslations();
  const selection = useUI((s) => s.selection);
  const clear = useUI((s) => s.clearSelection);
  const ws = useCurrentWorkspace();
  const members = useMembers(ws?.id);
  const labels = useLabels(ws?.id);

  const action = (label: string, icon: React.ReactNode, onClick?: () => void) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button tooltip={false} variant="ghost" size="icon" onClick={onClick} aria-label={label} className="text-background hover:bg-white/15 hover:text-background dark:text-foreground dark:hover:bg-white/10">
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <AnimatePresence>
      {selection.length > 0 && (
        <motion.div
          initial={{ y: 24, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 24, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 0.8, 0.24, 1] }}
          className="fixed inset-x-0 bottom-24 z-50 flex justify-center px-3 md:bottom-6"
          role="toolbar"
          aria-label={t("common.selected", { count: selection.length })}
        >
          <div className="flex items-center gap-1 rounded-2xl bg-foreground py-1.5 pr-1.5 pl-4 text-background shadow-elev-4 dark:bg-raised dark:text-foreground dark:ring-1 dark:ring-border">
            <span className="mr-2 text-sm font-medium tnum">{t("common.selected", { count: selection.length })}</span>
            {action(t("task.markDone"), <CheckCheck />, () => { completeTasks(selection); clear(); })}
            <DatePicker value={null} onChange={(d) => { rescheduleTasks(selection, d); clear(); }} allowTime={false} align="center">
              <span>{action(t("task.reschedule"), <CalendarDays />)}</span>
            </DatePicker>
            <ProjectPicker value={null} onChange={(p, s) => { moveTasks(selection, { projectId: p, sectionId: s }); clear(); }}>
              <span>{action(t("task.moveTo"), <FolderInput />)}</span>
            </ProjectPicker>
            <AssigneePicker people={members} selected={[]} onToggle={(uid) => { bulkAssign(selection, uid); clear(); }}>
              <span>{action(t("task.assign"), <UserPlus />)}</span>
            </AssigneePicker>
            <LabelPicker labels={labels} selected={[]} onToggle={(lid) => { bulkLabel(selection, lid); clear(); }}>
              <span>{action(t("task.addLabel"), <Tag />)}</span>
            </LabelPicker>
            {action(t("common.delete"), <Trash2 />, () => { deleteTasks(selection); clear(); })}
            <span className="mx-1 h-5 w-px bg-white/20" />
            {action(t("common.close"), <X />, clear)}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
