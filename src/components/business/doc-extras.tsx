"use client";

import { History, Link2, RotateCcw, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { RichView } from "@/components/editor/rich-editor";
import { TaskList } from "@/components/tasks/task-list";
import { foldFilter } from "@/components/tasks/pickers";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { useFormat } from "@/lib/format";
import { isOpen } from "@/lib/health";
import type { Note, NoteVersion } from "@/lib/types";
import { cn } from "@/lib/utils";
import { linkTask, restoreVersion } from "@/store/business-actions";
import { indexRows } from "@/store/index-rows";
import { liveTasks, useToday, useTz } from "@/store/hooks";
import { mergeRows, useStore } from "@/store/store";

/** Versions of a document. On Supabase they are fetched when the history opens (not kept offline). */
function useNoteVersions(noteId: string, open: boolean, changedAt: string): { versions: NoteVersion[]; loading: boolean } {
  const kind = useStore((s) => s.adapter?.kind);
  const all = useStore((s) => s.data.note_versions);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const loading = open && kind === "supabase" && loadedFor !== noteId;
  useEffect(() => {
    if (!open || kind !== "supabase") return;
    let cancelled = false;
    void getBrowserSupabase()
      .from("note_versions")
      .select("*")
      .eq("note_id", noteId)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (cancelled) return;
        if (data) mergeRows(indexRows({ note_versions: data }));
        setLoadedFor(noteId);
      });
    return () => {
      cancelled = true;
    };
    // fetched again when the document changes (a restore makes a new version on the server)
  }, [open, kind, noteId, changedAt]);
  const versions = useMemo(() => Object.values(all).filter((v) => v.note_id === noteId).sort((a, b) => b.created_at.localeCompare(a.created_at)), [all, noteId]);
  return { versions, loading };
}

export function VersionsButton({ note, writable, onRestored }: { note: Note; writable: boolean; onRestored: () => void }) {
  const t = useTranslations();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)} className="text-muted-foreground">
        <History /> {t("docs.history")}
      </Button>
      {open && <VersionsDialog note={note} writable={writable} onClose={() => setOpen(false)} onRestored={onRestored} />}
    </>
  );
}

function VersionsDialog({ note, writable, onClose, onRestored }: { note: Note; writable: boolean; onClose: () => void; onRestored: () => void }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const profiles = useStore((s) => s.data.profiles);
  const { versions, loading } = useNoteVersions(note.id, true, note.updated_at);
  const [selected, setSelected] = useState<string | null>(null);
  const current = versions.find((v) => v.id === selected) ?? versions[0];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{t("docs.historyTitle", { title: note.title || t("notes.untitled") })}</DialogTitle>
          <DialogDescription>{t("docs.historyHint")}</DialogDescription>
        </DialogHeader>
        {versions.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">{loading ? "…" : t("docs.noVersions")}</p>
        ) : (
          <div className="grid min-h-0 gap-3 md:grid-cols-[14rem_1fr]">
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto" aria-label={t("docs.versions")}>
              {versions.map((v) => (
                <li key={v.id}>
                  <button
                    type="button"
                    aria-current={v.id === current?.id}
                    onClick={() => setSelected(v.id)}
                    className={cn("w-full rounded-lg px-2.5 py-2 text-left text-13 hover:bg-muted", v.id === current?.id && "bg-muted")}
                  >
                    <span className="block font-medium tnum">{f.relativeWithDate(v.created_at.slice(0, 10))}, {f.time(v.created_at)}</span>
                    <span className="block truncate text-xs text-muted-foreground">{profiles[v.created_by ?? ""]?.name ?? "—"} · {v.title || t("notes.untitled")}</span>
                  </button>
                </li>
              ))}
            </ul>
            {current && (
              <div className="flex min-h-0 flex-col rounded-xl border">
                <div className="max-h-[52vh] flex-1 overflow-y-auto p-4">
                  <h3 className="mb-2 font-display text-xl font-bold">{current.title || t("notes.untitled")}</h3>
                  <RichView value={current.content} className="text-sm" />
                </div>
                {writable && (
                  <div className="flex justify-end border-t p-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        restoreVersion(note, current);
                        onRestored();
                        onClose();
                      }}
                    >
                      <RotateCcw /> {t("docs.restore")}
                    </Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Tasks linked to a document (an SOP and the tasks that follow it). */
export function LinkedTasks({ note, writable }: { note: Note; writable: boolean }) {
  const t = useTranslations();
  const links = useStore((s) => s.data.note_tasks);
  const tasksById = useStore((s) => s.data.tasks);
  const linked = useMemo(
    () => Object.values(links).filter((l) => l.note_id === note.id).map((l) => tasksById[l.task_id]).filter((x) => x && !x.deleted_at),
    [links, tasksById, note.id],
  );
  const candidates = useMemo(() => {
    const ids = new Set(linked.map((x) => x.id));
    return liveTasks(tasksById).filter((x) => x.workspace_id === note.workspace_id && !ids.has(x.id) && isOpen(x)).sort((a, b) => Number(b.project_id === note.project_id) - Number(a.project_id === note.project_id));
  }, [tasksById, linked, note.workspace_id, note.project_id]);
  return (
    <section aria-labelledby={`links-${note.id}`} className="mt-6 border-t pt-4">
      <div className="mb-2 flex items-center gap-2">
        <h3 id={`links-${note.id}`} className="flex flex-1 items-center gap-1.5 font-sans text-sm font-semibold tracking-normal"><Link2 className="size-4 text-muted-foreground" /> {t("docs.linkedTasks")}</h3>
        {writable && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground">{t("docs.linkTask")}</Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <Command filter={foldFilter}>
                <CommandInput placeholder={t("docs.searchTask")} />
                <CommandList>
                  <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                  <CommandGroup>
                    {candidates.slice(0, 50).map((x) => (
                      <CommandItem key={x.id} value={`${x.title} ${x.id}`} keywords={[x.title]} onSelect={() => linkTask(note, x.id, true)}>
                        <span className="truncate">{x.title}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>
      {linked.length === 0 ? (
        <p className="text-13 text-muted-foreground">{t("docs.noLinked")}</p>
      ) : (
        <div className="space-y-1">
          <TaskList groups={[{ key: note.id, tasks: linked, noAdd: true }]} showProject />
          {writable && (
            <ul className="flex flex-wrap gap-1.5 pt-1">
              {linked.map((x) => (
                <li key={x.id}>
                  <button type="button" onClick={() => linkTask(note, x.id, false)} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs text-muted-foreground hover:text-foreground" aria-label={t("docs.unlink", { title: x.title })}>
                    <X className="size-3" /> {x.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
