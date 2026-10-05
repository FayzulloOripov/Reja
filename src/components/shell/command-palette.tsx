"use client";

import { FileText, FolderPlus, Languages, Moon, Plus, Search, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@/components/providers/theme";
import { useMemo, useState } from "react";
import { ProjectDot, StatusIcon, UserAvatar } from "@/components/common/bits";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Command } from "@/components/ui/command";
import { matchScore } from "@/lib/text";
import { switchWorkspace, updateProfile } from "@/store/actions";
import { useAllTasks, useCurrentWorkspace, useMembers, useProjects, useWorkspaces } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { setLocaleCookie } from "@/server/actions/locale";
import { foldFilter } from "../tasks/pickers";
import { useNavItems } from "./sidebar";

export function CommandPalette() {
  const t = useTranslations();
  const open = useUI((s) => s.paletteOpen);
  const setOpen = useUI((s) => s.setPalette);
  const openTask = useUI((s) => s.openTask);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const setNewProject = useUI((s) => s.setNewProject);
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const locale = useLocale();
  const [query, setQuery] = useState("");
  const tasks = useAllTasks();
  const projects = useProjects(undefined, { includeArchived: true });
  const notes = useStore((s) => s.data.notes);
  const workspaces = useWorkspaces();
  const ws = useCurrentWorkspace();
  const members = useMembers(ws?.id);
  const { primary, secondary } = useNavItems();

  const run = (fn: () => void) => {
    setOpen(false);
    setQuery("");
    fn();
  };

  // Rank tasks ourselves: there can be thousands, cmdk only gets the top matches.
  const taskHits = useMemo(() => {
    if (!query.trim()) return tasks.filter((x) => x.status !== "done").slice(0, 6);
    return tasks
      .map((x) => ({ x, s: matchScore(x.title, query) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s || Number(a.x.status === "done") - Number(b.x.status === "done"))
      .slice(0, 12)
      .map((r) => r.x);
  }, [tasks, query]);

  const noteHits = useMemo(
    () =>
      Object.values(notes)
        .filter((n) => !n.deleted_at && query.trim() && matchScore(n.title || "", query) > 0)
        .slice(0, 6),
    [notes, query],
  );

  const projectById = useMemo(() => Object.fromEntries(projects.map((p) => [p.id, p])), [projects]);

  return (
    <CommandDialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(""); }} title={t("nav.search")} description={t("palette.placeholder")} className="sm:max-w-xl">
      <Command filter={(value, search, keywords) => (value.startsWith("task:") || value.startsWith("note:") ? 1 : foldFilter(value, search, keywords))}>
        <CommandInput placeholder={t("palette.placeholder")} value={query} onValueChange={setQuery} />
        <CommandList className="max-h-[60vh]">
          <CommandEmpty>{t("common.noResults")}</CommandEmpty>

          {taskHits.length > 0 && (
            <CommandGroup heading={t("palette.tasks")}>
              {taskHits.map((task) => {
                const p = task.project_id ? projectById[task.project_id] : undefined;
                return (
                  <CommandItem key={task.id} value={`task:${task.id}`} onSelect={() => run(() => openTask(task.id))}>
                    <StatusIcon status={task.status} />
                    <span className="truncate">{task.title}</span>
                    {p && (
                      <span className="ml-auto flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <ProjectDot color={p.color} size="sm" />
                        {p.name}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          <CommandGroup heading={t("palette.actions")}>
            <CommandItem value={t("palette.newTask")} onSelect={() => run(() => openQuickAdd())}>
              <Plus /> {t("palette.newTask")} <CommandShortcut>Q</CommandShortcut>
            </CommandItem>
            <CommandItem value={t("palette.newProject")} onSelect={() => run(() => setNewProject(true))}>
              <FolderPlus /> {t("palette.newProject")}
            </CommandItem>
            <CommandItem
              value={t("palette.toggleTheme")}
              onSelect={() =>
                run(() => {
                  const next = resolvedTheme === "dark" ? "light" : "dark";
                  setTheme(next);
                  updateProfile({ theme: next });
                })
              }
            >
              <Moon /> {t("palette.toggleTheme")}
            </CommandItem>
            <CommandItem
              value={`${t("palette.switchLanguage")} language til`}
              onSelect={() =>
                run(async () => {
                  const next = locale === "uz" ? "en" : "uz";
                  updateProfile({ language: next });
                  await setLocaleCookie(next);
                  router.refresh();
                })
              }
            >
              <Languages /> {t("palette.switchLanguage")} <CommandShortcut>{locale === "uz" ? "EN" : "UZ"}</CommandShortcut>
            </CommandItem>
          </CommandGroup>

          <CommandGroup heading={t("palette.projects")}>
            {projects.map((p) => (
              <CommandItem key={p.id} value={`${p.name} ${p.id}`} keywords={[p.name, p.area ?? ""]} onSelect={() => run(() => router.push(`/projects/${p.id}`))}>
                <ProjectDot color={p.color} /> {p.name}
              </CommandItem>
            ))}
          </CommandGroup>

          {noteHits.length > 0 && (
            <CommandGroup heading={t("palette.notes")}>
              {noteHits.map((n) => (
                <CommandItem key={n.id} value={`note:${n.id}`} onSelect={() => run(() => router.push(`/projects/${n.project_id}?view=notes&note=${n.id}`))}>
                  <FileText /> {n.title || t("notes.untitled")}
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          <CommandGroup heading={t("palette.navigation")}>
            {[...primary, ...secondary].map((item) => (
              <CommandItem key={item.href} value={`${item.label} ${item.href}`} keywords={[item.label]} onSelect={() => run(() => router.push(item.href))}>
                <item.icon /> {item.label}
              </CommandItem>
            ))}
            <CommandItem value={t("nav.settings")} onSelect={() => run(() => router.push("/settings/profile"))}>
              <Search /> {t("nav.settings")}
            </CommandItem>
          </CommandGroup>

          {members.length > 1 && (
            <CommandGroup heading={t("palette.people")}>
              {members.map((m) => (
                <CommandItem key={m.id} value={`${m.name} ${m.email ?? ""} person`} keywords={[m.name]} onSelect={() => run(() => router.push(`/workload?person=${m.id}`))}>
                  <UserAvatar profile={m} size={18} /> {m.name}
                  <span className="ml-auto text-xs text-muted-foreground">{t(`settings.roles.${m.role}`)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          )}

          {workspaces.length > 1 && (
            <CommandGroup heading={t("palette.workspaces")}>
              {workspaces.map((w) => (
                <CommandItem key={w.id} value={`${w.name} workspace ${w.id}`} keywords={[w.name]} onSelect={() => run(() => switchWorkspace(w.id))}>
                  <Users /> {w.name}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
