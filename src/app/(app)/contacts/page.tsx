"use client";

import { Building2, Pencil, Phone, Plus, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageHeader } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { TaskList } from "@/components/tasks/task-list";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { waitingTasks } from "@/lib/org";
import { isFullMember } from "@/lib/permissions";
import type { Contact } from "@/lib/types";
import { createContact, deleteContact, updateContact } from "@/store/org-actions";
import { liveTasks, useContacts, useCurrentWorkspace, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";

/** People outside the app (a client's CTO, a supplier) that tasks and meetings can point at. */
export default function ContactsPage() {
  const t = useTranslations();
  const ws = useCurrentWorkspace();
  const role = useWorkspaceRole(ws?.id);
  const contacts = useContacts(ws?.id);
  const tasks = useStore((s) => s.data.tasks);
  const [editing, setEditing] = useState<Contact | "new" | null>(null);
  const waitingBy = useMemo(() => {
    const m = new Map<string, ReturnType<typeof waitingTasks>>();
    for (const task of waitingTasks(liveTasks(tasks))) {
      if (task.waiting_on_contact_id) m.set(task.waiting_on_contact_id, [...(m.get(task.waiting_on_contact_id) ?? []), task]);
    }
    return m;
  }, [tasks]);
  const writable = isFullMember(role);

  return (
    <PageContainer>
      <PageHeader
        title={t("contacts.title")}
        subtitle={t("contacts.subtitle")}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-info-soft text-info-fg"><Building2 className="size-5" /></span>}
        actions={writable && <Button size="sm" onClick={() => setEditing("new")}><Plus /> {t("contacts.new")}</Button>}
      />
      {!writable ? (
        <EmptyState illustration="team" title={t("contacts.guest")} body={t("contacts.guestBody")} />
      ) : contacts.length === 0 ? (
        <EmptyState illustration="team" title={t("contacts.empty")} body={t("contacts.emptyBody")} action={<Button onClick={() => setEditing("new")}><Plus /> {t("contacts.new")}</Button>} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {contacts.map((c) => {
            const waiting = waitingBy.get(c.id) ?? [];
            return (
              <li key={c.id} className="rounded-2xl border bg-card p-4 shadow-elev-1">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold">{c.name.slice(0, 1).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate font-sans text-sm font-semibold tracking-normal">{c.name}</h2>
                    {c.company && <p className="truncate text-13 text-muted-foreground">{c.company}</p>}
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {c.phone && (
                        <a href={`tel:${c.phone.replace(/\s/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground">
                          <Phone className="size-3" /> {c.phone}
                        </a>
                      )}
                      {c.telegram && (
                        <a href={`https://t.me/${encodeURIComponent(c.telegram)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                          <Send className="size-3" /> @{c.telegram}
                        </a>
                      )}
                    </div>
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(c)} aria-label={t("contacts.edit", { name: c.name })}>
                    <Pencil />
                  </Button>
                </div>
                {c.note && <p className="mt-2 text-13 whitespace-pre-line text-muted-foreground">{c.note}</p>}
                {waiting.length > 0 && (
                  <div className="mt-3 border-t pt-2">
                    <p className="px-1 text-xs font-medium text-muted-foreground">{t("contacts.waitingOn", { count: waiting.length })}</p>
                    <TaskList groups={[{ key: c.id, tasks: waiting, noAdd: true }]} showProject />
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {editing && ws && <ContactDialog contact={editing === "new" ? null : editing} workspaceId={ws.id} onClose={() => setEditing(null)} />}
    </PageContainer>
  );
}

function ContactDialog({ contact, workspaceId, onClose }: { contact: Contact | null; workspaceId: string; onClose: () => void }) {
  const t = useTranslations();
  const [form, setForm] = useState({
    name: contact?.name ?? "",
    company: contact?.company ?? "",
    phone: contact?.phone ?? "",
    telegram: contact?.telegram ?? "",
    note: contact?.note ?? "",
  });
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{contact ? t("contacts.editTitle") : t("contacts.new")}</DialogTitle>
        </DialogHeader>
        <form
          id="contact-form"
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.name.trim()) return;
            if (contact) {
              updateContact(contact.id, {
                name: form.name.trim(),
                company: form.company.trim() || null,
                phone: form.phone.trim() || null,
                telegram: form.telegram.trim().replace(/^@/, "") || null,
                note: form.note.trim() || null,
              });
            } else {
              createContact({ workspaceId, ...form });
            }
            onClose();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="c-name">{t("common.name")}</Label>
            <Input id="c-name" autoFocus value={form.name} onChange={set("name")} maxLength={120} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-company">{t("contacts.company")}</Label>
            <Input id="c-company" value={form.company} onChange={set("company")} maxLength={120} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="c-phone">{t("contacts.phone")}</Label>
              <Input id="c-phone" type="tel" value={form.phone} onChange={set("phone")} maxLength={40} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="c-tg">Telegram</Label>
              <Input id="c-tg" value={form.telegram} onChange={set("telegram")} maxLength={64} placeholder="@username" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="c-note">{t("contacts.note")}</Label>
            <Textarea id="c-note" value={form.note} onChange={set("note")} maxLength={2000} rows={3} />
          </div>
        </form>
        <DialogFooter className="gap-2 sm:justify-between">
          {contact ? (
            <Button
              variant="ghost"
              className="text-destructive"
              onClick={() => {
                deleteContact(contact);
                onClose();
              }}
            >
              <Trash2 /> {t("common.delete")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
            <Button type="submit" form="contact-form" disabled={!form.name.trim()}>{t("common.save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
