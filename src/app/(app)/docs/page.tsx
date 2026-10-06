"use client";

import { FileText, Link2, Search } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageHeader, ProjectBadge } from "@/components/common/bits";
import { docToText } from "@/components/editor/rich-editor";
import { EmptyState } from "@/components/common/empty-state";
import { ModuleOff } from "@/components/business/module-off";
import { PageContainer } from "@/components/shell/app-client";
import { Input } from "@/components/ui/input";
import { useFormat } from "@/lib/format";
import { matchScore } from "@/lib/text";
import type { JSONContent } from "@tiptap/react";
import { useCurrentWorkspace, useToday, useTz } from "@/store/hooks";
import { useStore } from "@/store/store";

/** Every project document (SOPs, scripts, proposals) in the workspace, searchable. */
export default function DocsPage() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const notes = useStore((s) => s.data.notes);
  const projects = useStore((s) => s.data.projects);
  const links = useStore((s) => s.data.note_tasks);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const linkCount = new Map<string, number>();
    for (const l of Object.values(links)) linkCount.set(l.note_id, (linkCount.get(l.note_id) ?? 0) + 1);
    return Object.values(notes)
      .filter((n) => n.workspace_id === ws?.id && !n.deleted_at && projects[n.project_id] && !projects[n.project_id].deleted_at)
      .map((n) => ({ note: n, text: docToText(n.content as JSONContent | null).text, links: linkCount.get(n.id) ?? 0 }))
      .filter((x) => !q.trim() || matchScore(`${x.note.title} ${x.text} ${projects[x.note.project_id]?.name}`, q) > 0)
      .sort((a, b) => b.note.updated_at.localeCompare(a.note.updated_at));
  }, [notes, projects, links, ws?.id, q]);

  if (!ws) return null;
  if (!ws.modules?.docs) return <ModuleOff module="docs" />;
  return (
    <PageContainer>
      <PageHeader
        title={t("docs.title")}
        subtitle={t("docs.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-info-soft text-info-fg"><FileText className="size-5" /></span>}
      />
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("docs.search")} aria-label={t("docs.search")} className="pl-9" />
      </div>
      {list.length === 0 ? (
        <EmptyState illustration="notes" title={q ? t("common.noResults") : t("docs.empty")} body={q ? undefined : t("docs.emptyBody")} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {list.map(({ note, text, links: count }) => {
            const project = projects[note.project_id];
            return (
              <li key={note.id}>
                <Link href={`/projects/${note.project_id}?view=notes&note=${note.id}`} className="block h-full rounded-2xl border bg-card p-4 shadow-elev-1 transition-colors hover:bg-muted/40">
                  <span className="flex items-start gap-2">
                    <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 text-sm font-semibold break-words">{note.title || t("notes.untitled")}</span>
                  </span>
                  {text && <span className="mt-1.5 line-clamp-2 block text-13 text-muted-foreground">{text}</span>}
                  <span className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {project && <ProjectBadge name={project.name} color={project.color} />}
                    <span>{f.ago(note.updated_at)}</span>
                    {count > 0 && <span className="inline-flex items-center gap-1"><Link2 className="size-3" /> {t("docs.linkedCount", { count })}</span>}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
