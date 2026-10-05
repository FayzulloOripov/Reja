"use client";

import { FileText, Plus, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/common/empty-state";
import { RichEditor } from "@/components/editor/rich-editor";
import { Button } from "@/components/ui/button";
import { useFormat } from "@/lib/format";
import type { Note, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createNote, deleteNote, updateNote } from "@/store/actions";
import { useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";

export function NotesTab({ project, writable }: { project: Project; writable: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const all = useStore((s) => s.data.notes);
  const notes = useMemo(
    () => Object.values(all).filter((n) => n.project_id === project.id && !n.deleted_at).sort((a, b) => b.updated_at.localeCompare(a.updated_at)),
    [all, project.id],
  );
  const selectedId = params.get("note") ?? notes[0]?.id ?? null;
  const note = notes.find((n) => n.id === selectedId) ?? notes[0];

  const select = (id: string) => {
    const sp = new URLSearchParams(params.toString());
    sp.set("note", id);
    router.replace(`?${sp.toString()}`, { scroll: false });
  };

  if (notes.length === 0) {
    return (
      <EmptyState
        illustration="notes"
        title={t("empty.notesTitle")}
        body={t("empty.notesBody")}
        action={writable && <Button onClick={() => select(createNote(project).id)}><Plus /> {t("empty.newNote")}</Button>}
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-[15rem_1fr]">
      <aside className="space-y-1">
        {writable && (
          <Button variant="outline" size="sm" className="mb-2 w-full justify-start bg-card" onClick={() => select(createNote(project).id)}>
            <Plus /> {t("empty.newNote")}
          </Button>
        )}
        <ul className="flex gap-1 overflow-x-auto md:flex-col">
          {notes.map((n) => (
            <li key={n.id} className="shrink-0">
              <button
                onClick={() => select(n.id)}
                aria-current={n.id === note?.id}
                className={cn("flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-muted", n.id === note?.id && "bg-card shadow-elev-1")}
              >
                <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0">
                  <span className="block truncate text-13 font-medium">{n.title || t("notes.untitled")}</span>
                  <span className="block text-2xs text-muted-foreground">{f.ago(n.updated_at)}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      {note && <NoteEditor key={note.id} note={note} writable={writable} />}
    </div>
  );
}

function NoteEditor({ note, writable }: { note: Note; writable: boolean }) {
  const t = useTranslations();
  const [title, setTitle] = useState(note.title);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => setTitle(note.title), [note.title]);
  return (
    <article className="min-h-[50vh] rounded-2xl border bg-card p-5 shadow-elev-1 sm:p-8">
      <div className="flex items-start gap-2">
        <input
          value={title}
          readOnly={!writable}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => title !== note.title && updateNote(note.id, { title })}
          placeholder={t("notes.titlePlaceholder")}
          aria-label={t("notes.titlePlaceholder")}
          className="flex-1 bg-transparent font-display text-28 font-bold outline-none placeholder:text-subtle-foreground"
        />
        {writable && (
          <Button variant="ghost" size="icon-sm" onClick={() => deleteNote(note.id)} aria-label={t("common.delete")}>
            <Trash2 />
          </Button>
        )}
      </div>
      <div className="mt-4">
        <RichEditor
          value={note.content}
          editable={writable}
          toolbar
          placeholder={t("notes.bodyPlaceholder")}
          className="min-h-[40vh] text-[15px]"
          onChange={(doc) => {
            if (timer.current) clearTimeout(timer.current);
            timer.current = setTimeout(() => updateNote(note.id, { content: doc }), 700);
          }}
        />
      </div>
    </article>
  );
}
