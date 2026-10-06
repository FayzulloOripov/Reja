"use client";

import { FileText, GitBranch, Link2, Loader2, Paperclip, Plus, SmilePlus, Trash2, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { StatusIcon, UserAvatar } from "@/components/common/bits";
import { docToText, RichEditor, RichView } from "@/components/editor/rich-editor";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { isMove } from "@/lib/activity";
import { useFormat } from "@/lib/format";
import type { ActivityEntry, Comment, Profile, RichDoc, Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  addChecklistItem,
  addComment,
  addDependency,
  deleteAttachment,
  deleteChecklistItem,
  deleteComment,
  removeDependency,
  toggleReaction,
  updateChecklistItem,
  uploadAttachment,
} from "@/store/actions";
import { useActivity, useAllTasks, useChecklist, useSubtasks, useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { InlineAdd } from "./task-list";
import { TaskRow } from "./task-row";
import { foldFilter } from "./pickers";

function SectionTitle({ icon, title, count, action }: { icon: React.ReactNode; title: string; count?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-1.5 flex items-center gap-2 text-13 font-semibold [&_svg]:size-4 [&_svg]:text-muted-foreground">
      {icon}
      {title}
      {count && <span className="text-xs font-normal text-muted-foreground tnum">{count}</span>}
      <span className="flex-1" />
      {action}
    </div>
  );
}

// ------------------------------------------------------------------ subtasks

export function SubtasksSection({ task, writable }: { task: Task; writable: boolean }) {
  const t = useTranslations();
  const subtasks = useSubtasks(task.id);
  const done = subtasks.filter((s) => s.status === "done").length;
  if (!writable && subtasks.length === 0) return null;
  return (
    <section>
      <SectionTitle icon={<GitBranch />} title={t("task.subtasks")} count={subtasks.length ? t("common.of", { done, total: subtasks.length }) : undefined} />
      <div className="-mx-2.5 space-y-px">
        {subtasks.map((s) => (
          <TaskRow key={s.id} task={s} readOnly={!writable} />
        ))}
        {writable && <InlineAdd sticky defaults={{ parentId: task.id, projectId: task.project_id }} placeholder={t("task.addSubtask")} />}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ checklist

export function ChecklistSection({ task, writable }: { task: Task; writable: boolean }) {
  const t = useTranslations();
  const items = useChecklist(task.id);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const done = items.filter((i) => i.done).length;
  if (!writable && items.length === 0) return null;
  return (
    <section>
      <SectionTitle
        icon={<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="2" width="12" height="12" rx="3" /><path d="M5 8l2 2 4-4" /></svg>}
        title={t("task.checklist")}
        count={items.length ? t("common.of", { done, total: items.length }) : undefined}
      />
      {items.length > 0 && (
        <div className="mb-2 h-1 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-success transition-[width] duration-300" style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="space-y-0.5">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1 hover:bg-muted/60">
            <input
              type="checkbox"
              checked={item.done}
              disabled={!writable}
              onChange={(e) => updateChecklistItem(item.id, { done: e.target.checked })}
              className="size-4 accent-[var(--success)]"
              aria-label={item.text}
            />
            <input
              defaultValue={item.text}
              readOnly={!writable}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== item.text) updateChecklistItem(item.id, { text: v });
              }}
              onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
              className={cn("flex-1 bg-transparent text-sm outline-none", item.done && "text-muted-foreground line-through")}
            />
            {writable && (
              <button onClick={() => deleteChecklistItem(item.id)} aria-label={t("common.delete")} className="text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground">
                <X className="size-3.5" />
              </button>
            )}
          </li>
        ))}
      </ul>
      {writable &&
        (adding ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && draft.trim()) {
                addChecklistItem(task, draft);
                setDraft("");
              }
              if (e.key === "Escape") setAdding(false);
            }}
            onBlur={() => !draft.trim() && setAdding(false)}
            placeholder={t("task.addChecklist")}
            className="mt-1 h-8 w-full rounded-md border bg-card px-2.5 text-sm outline-none focus:ring-2 focus:ring-ring/30"
          />
        ) : (
          <button onClick={() => setAdding(true)} className="mt-0.5 flex h-8 items-center gap-2 px-1 text-13 text-muted-foreground hover:text-foreground">
            <Plus className="size-4" /> {t("task.addChecklist")}
          </button>
        ))}
    </section>
  );
}

// ------------------------------------------------------------------ dependencies

export function DependenciesSection({ task, writable }: { task: Task; writable: boolean }) {
  const t = useTranslations();
  const deps = useStore((s) => s.data.task_dependencies);
  const tasks = useStore((s) => s.data.tasks);
  const all = useAllTasks();
  const openTask = useUI((s) => s.openTask);
  const blockedBy = useMemo(() => Object.values(deps).filter((d) => d.blocked_id === task.id).map((d) => tasks[d.blocker_id]).filter(Boolean), [deps, tasks, task.id]);
  const blocks = useMemo(() => Object.values(deps).filter((d) => d.blocker_id === task.id).map((d) => tasks[d.blocked_id]).filter(Boolean), [deps, tasks, task.id]);
  const candidates = useMemo(() => all.filter((x) => x.workspace_id === task.workspace_id && x.id !== task.id && x.project_id).slice(0, 300), [all, task]);
  const [open, setOpen] = useState(false);

  if (!writable && blockedBy.length === 0 && blocks.length === 0) return null;
  if (!task.project_id) return null;

  const row = (x: Task, kind: "blockedBy" | "blocks") => (
    <li key={`${kind}${x.id}`} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted/60">
      <StatusIcon status={x.status} />
      <button onClick={() => openTask(x.id)} className={cn("flex-1 truncate text-left text-sm", x.status === "done" && "text-muted-foreground line-through")}>
        {x.title}
      </button>
      {writable && (
        <button
          onClick={() => (kind === "blockedBy" ? removeDependency(x.id, task.id) : removeDependency(task.id, x.id))}
          aria-label={t("common.delete")}
          className="text-muted-foreground opacity-0 group-hover:opacity-100"
        >
          <X className="size-3.5" />
        </button>
      )}
    </li>
  );

  return (
    <section>
      <SectionTitle
        icon={<Link2 />}
        title={t("task.dependencies")}
        action={
          writable && (
            <Popover open={open} onOpenChange={setOpen}>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="xs" className="text-muted-foreground">
                  <Plus /> {t("task.addDependency")}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-80 p-0">
                <Command filter={foldFilter}>
                  <CommandInput placeholder={t("common.search")} />
                  <CommandList>
                    <CommandEmpty>{t("common.noResults")}</CommandEmpty>
                    <CommandGroup heading={t("task.blockedBy")}>
                      {candidates.map((x) => (
                        <CommandItem key={x.id} value={`${x.title} ${x.id}`} keywords={[x.title]} onSelect={() => { addDependency(x.id, task.id, task.workspace_id); setOpen(false); }}>
                          <StatusIcon status={x.status} /> <span className="truncate">{x.title}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          )
        }
      />
      {blockedBy.length > 0 && (
        <>
          <p className="px-1 text-xs font-medium text-warning-fg">{t("task.blockedBy")}</p>
          <ul>{blockedBy.map((x) => row(x, "blockedBy"))}</ul>
        </>
      )}
      {blocks.length > 0 && (
        <>
          <p className="mt-1 px-1 text-xs font-medium text-muted-foreground">{t("task.blocks")}</p>
          <ul>{blocks.map((x) => row(x, "blocks"))}</ul>
        </>
      )}
    </section>
  );
}

// ------------------------------------------------------------------ attachments

function formatSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachmentsSection({ task, writable }: { task: Task; writable: boolean }) {
  const t = useTranslations("task");
  const all = useStore((s) => s.data.attachments);
  const adapter = useStore((s) => s.adapter);
  const items = useMemo(() => Object.values(all).filter((a) => a.task_id === task.id && !a.deleted_at), [all, task.id]);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let alive = true;
    for (const a of items) {
      if (urls[a.id] || !adapter) continue;
      void adapter.fileUrl(a.storage_path).then((u) => alive && u && setUrls((m) => ({ ...m, [a.id]: u })));
    }
    return () => {
      alive = false;
    };
  }, [items, adapter, urls]);

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    for (const f of Array.from(files)) void uploadAttachment(task, f);
  };

  if (!writable && items.length === 0) return null;

  return (
    <section
      onDragOver={(e) => {
        if (!writable) return;
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        if (writable) onFiles(e.dataTransfer.files);
      }}
    >
      <SectionTitle
        icon={<Paperclip />}
        title={t("attachments")}
        count={items.length ? String(items.length) : undefined}
        action={
          writable && (
            <Button variant="ghost" size="xs" className="text-muted-foreground" onClick={() => fileRef.current?.click()}>
              <Upload /> {t("chooseFile")}
            </Button>
          )
        }
      />
      <input ref={fileRef} type="file" multiple hidden onChange={(e) => onFiles(e.target.files)} />
      <div className={cn("rounded-xl border border-dashed p-2 transition-colors", over ? "border-brand bg-brand-soft" : items.length ? "border-transparent p-0" : "")}>
        {items.length === 0 ? (
          <button onClick={() => fileRef.current?.click()} className="flex min-h-11 w-full items-center justify-center gap-2 py-3 text-13 text-muted-foreground">
            <Upload className="size-4" aria-hidden />
            {/* "drop here" only makes sense with a mouse */}
            <span className="[@media(hover:none)]:hidden">{t("dropFiles")}</span>
            <span className="hidden [@media(hover:none)]:inline">{t("chooseFile")}</span>
          </button>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {items.map((a) => (
              <li key={a.id} className="group relative overflow-hidden rounded-lg border bg-card">
                <a href={urls[a.id]} target="_blank" rel="noopener noreferrer" className="block">
                  {a.mime.startsWith("image/") && urls[a.id] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={urls[a.id]} alt={a.name} className="h-24 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-24 items-center justify-center bg-muted">
                      {urls[a.id] ? <FileText className="size-8 text-muted-foreground" /> : <Loader2 className="size-5 animate-spin text-muted-foreground" />}
                    </div>
                  )}
                  <div className="px-2 py-1.5">
                    <p className="truncate text-xs font-medium">{a.name}</p>
                    <p className="text-2xs text-muted-foreground tnum">{formatSize(a.size)}</p>
                  </div>
                </a>
                {writable && (
                  <button onClick={() => deleteAttachment(a.id)} aria-label="delete" className="absolute top-1.5 right-1.5 rounded-md bg-card/90 p-1 opacity-0 shadow-elev-1 group-hover:opacity-100">
                    <Trash2 className="size-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

// ------------------------------------------------------------------ comments & activity

const REACTIONS = ["👍", "❤️", "🎉", "👀", "✅", "😂"];

export function CommentsAndActivity({ task, writable, people }: { task: Task; writable: boolean; people: Profile[] }) {
  const t = useTranslations();
  const uid = useUserId();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const all = useStore((s) => s.data.comments);
  const reactions = useStore((s) => s.data.comment_reactions);
  const profiles = useStore((s) => s.data.profiles);
  const comments = useMemo(
    () => Object.values(all).filter((c) => c.task_id === task.id && !c.deleted_at).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [all, task.id],
  );
  const [draft, setDraft] = useState<{ doc: RichDoc; text: string; mentions: string[] }>({ doc: null, text: "", mentions: [] });
  const [editorKey, setEditorKey] = useState(0);
  const [tab, setTab] = useState("comments");
  const activity = useActivity({ taskId: task.id }, 100, tab === "activity");

  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    if (hash.startsWith("#comment-")) document.getElementById(hash.slice(1))?.scrollIntoView({ block: "center" });
  }, [comments.length]);

  function send() {
    const { text, mentions } = docToText(draft.doc as never);
    if (!text.trim()) return;
    addComment(task, draft.doc, text, mentions);
    setDraft({ doc: null, text: "", mentions: [] });
    setEditorKey((k) => k + 1);
  }

  const reactionsFor = (c: Comment) => {
    const map = new Map<string, string[]>();
    for (const r of Object.values(reactions)) if (r.comment_id === c.id) map.set(r.emoji, [...(map.get(r.emoji) ?? []), r.user_id]);
    return map;
  };

  return (
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList className="mb-3">
        <TabsTrigger value="comments">
          {t("task.comments")} {comments.length > 0 && <span className="ml-1 text-xs text-muted-foreground tnum">{comments.length}</span>}
        </TabsTrigger>
        <TabsTrigger value="activity">{t("task.activity")}</TabsTrigger>
      </TabsList>
      <TabsContent value="comments" className="space-y-4">
        {comments.map((c) => {
          const author = profiles[c.author_id];
          const rx = reactionsFor(c);
          return (
            <article key={c.id} id={`comment-${c.id}`} className="group flex gap-3">
              <UserAvatar profile={author} size={28} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-13 font-semibold">{author?.name ?? t("common.someone")}</span>
                  <time className="text-xs text-muted-foreground" dateTime={c.created_at}>{f.ago(c.created_at)}</time>
                  {c.author_id === uid && (
                    <button onClick={() => deleteComment(c.id)} className="ml-auto text-xs text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-danger-fg">
                      {t("common.delete")}
                    </button>
                  )}
                </div>
                <div className="mt-0.5 rounded-xl rounded-tl-sm bg-muted/70 px-3 py-2">
                  <RichView value={c.body} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {[...rx.entries()].map(([emoji, users]) => (
                    <button
                      key={emoji}
                      onClick={() => writable && toggleReaction(c, emoji)}
                      title={users.map((u) => profiles[u]?.name).join(", ")}
                      className={cn("inline-flex h-6 items-center gap-1 rounded-full border px-1.5 text-xs tnum", users.includes(uid) && "border-brand bg-brand-soft")}
                    >
                      {emoji} {users.length}
                    </button>
                  ))}
                  {writable && (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button aria-label="react" className="inline-flex h-6 items-center rounded-full px-1.5 text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted focus:opacity-100">
                          <SmilePlus className="size-3.5" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="flex w-auto gap-0.5 p-1" align="start">
                        {REACTIONS.map((e) => (
                          <button key={e} onClick={() => toggleReaction(c, e)} className="rounded-md p-1.5 text-lg hover:bg-muted">
                            {e}
                          </button>
                        ))}
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            </article>
          );
        })}
        {writable && (
          <div className="flex gap-3">
            <UserAvatar profile={profiles[uid]} size={28} />
            <div className="min-w-0 flex-1 rounded-xl border bg-card px-3 py-2 shadow-elev-1 focus-within:ring-2 focus-within:ring-ring/30">
              <RichEditor
                key={editorKey}
                value={null}
                mentions={people.filter((p) => p.id !== uid).map((p) => ({ id: p.id, name: p.name }))}
                placeholder={t("task.commentPlaceholder")}
                ariaLabel={t("task.commentPlaceholder")}
                onChange={(doc, text, mentions) => setDraft({ doc, text, mentions })}
                onSubmit={send}
              />
              <div className="mt-1 flex justify-end">
                <Button size="sm" onClick={send} disabled={!draft.text.trim()}>
                  {t("task.send")}
                </Button>
              </div>
            </div>
          </div>
        )}
      </TabsContent>
      <TabsContent value="activity">
        <ActivityList entries={activity} />
      </TabsContent>
    </Tabs>
  );
}

export function ActivityList({ entries, showTitle }: { entries: ActivityEntry[] | null; showTitle?: boolean }) {
  const t = useTranslations();
  const tx = t as unknown as ((key: string, values?: Record<string, string>) => string) & { has: (key: string) => boolean };
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const uid = useUserId();
  const profiles = useStore((s) => s.data.profiles);
  const sections = useStore((s) => s.data.sections);
  const projects = useStore((s) => s.data.projects);
  if (entries === null) return <div className="h-16 animate-pulse rounded-lg bg-muted" />;
  if (entries.length === 0) return <p className="py-4 text-center text-sm text-muted-foreground">{t("overview.activityEmpty")}</p>;
  const person = (id: unknown) => (id === uid ? t("common.you") : (profiles[String(id)]?.name ?? t("common.someone")));
  return (
    <ol className="relative space-y-3 border-l pl-4">
      {entries.map((e) => {
        const actor = e.actor_id ? person(e.actor_id) : t("common.system");
        const title = String(e.diff._title ?? e.diff.title ?? e.diff._name ?? e.diff.name ?? "");
        const fields = Object.keys(e.diff).filter((k) => !k.startsWith("_") && k !== "title" && k !== "name" && k !== "user_id" && k !== "snippet");
        let text: string;
        if (isMove(e)) {
          const to = (k: string) => ((e.diff[k] as unknown[] | undefined)?.[1] as string | null | undefined) ?? null;
          const sectionId = to("section_id");
          const projectId = to("project_id");
          text =
            "project_id" in e.diff
              ? tx("activity.movedToProject", { actor, title, project: projectId ? (projects[projectId]?.name ?? "…") : t("nav.inbox") })
              : tx("activity.movedToSection", { actor, title, section: sectionId ? (sections[sectionId]?.name ?? "…") : t("project.noSection") });
        } else if (e.action === "assigned") {
          text = tx("activity.assignedTo", { actor, title, person: person(e.diff.user_id) });
        } else {
          const key = e.entity_type === "project" ? `activity.project${e.action[0].toUpperCase()}${e.action.slice(1)}` : `activity.${e.action}`;
          text = tx.has(key) ? tx(key, { actor, title }) : `${actor} · ${e.action}`;
        }
        return (
          <li key={e.id} className="relative text-13">
            <span className="absolute top-1.5 -left-[21px] size-2.5 rounded-full border-2 border-background bg-border-strong" aria-hidden />
            <p>
              {text}
              {e.action === "updated" && !isMove(e) && fields.length > 0 && (
                <span className="text-muted-foreground"> — {fields.map((k) => (tx.has(`activity.field.${k}`) ? tx(`activity.field.${k}`) : k)).join(", ")}</span>
              )}
            </p>
            {typeof e.diff.snippet === "string" && <p className="mt-0.5 line-clamp-2 text-muted-foreground">“{e.diff.snippet}”</p>}
            <time className="text-xs text-muted-foreground" dateTime={e.created_at}>
              {f.ago(e.created_at)}
            </time>
            {showTitle && null}
          </li>
        );
      })}
    </ol>
  );
}
