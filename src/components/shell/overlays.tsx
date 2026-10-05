"use client";

import { NewProjectDialog } from "@/components/projects/new-project-dialog";
import { BulkBar } from "@/components/tasks/bulk-bar";
import { QuickAddDialog } from "@/components/tasks/quick-add";
import { TaskPanel } from "@/components/tasks/task-panel";
import { CommandPalette } from "./command-palette";
import { ShortcutsDialog } from "./shortcuts-dialog";

export function Overlays() {
  return (
    <>
      <QuickAddDialog />
      <CommandPalette />
      <ShortcutsDialog />
      <NewProjectDialog />
      <TaskPanel />
      <BulkBar />
    </>
  );
}
