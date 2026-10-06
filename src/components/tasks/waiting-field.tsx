"use client";

import { BellRing, Building2, Check, Plus, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { UserAvatar } from "@/components/common/bits";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFormat } from "@/lib/format";
import { defaultFollowUp, followUpDue, waitingDays, waitingOn, type WaitingOn } from "@/lib/org";
import { isFullMember } from "@/lib/permissions";
import type { Task } from "@/lib/types";
import { cn } from "@/lib/utils";
import { createContact, setFollowUp, setWaiting } from "@/store/org-actions";
import { useContacts, useMembers, useProfiles, useToday, useTz, useUserId, useWorkspaceRole } from "@/store/hooks";
import { useStore } from "@/store/store";
import { DatePicker, foldFilter } from "./pickers";

/** Waiting on a teammate or an outside contact, since when, and when to follow up. */
export function WaitingField({ task, disabled, button }: { task: Task; disabled: boolean; button: (children: ReactNode, cls?: string) => ReactNode }) {
  const t = useTranslations();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const profiles = useProfiles();
  const contacts = useStore((s) => s.data.contacts);
  const on = waitingOn(task);
  const days = waitingDays(task, today);
  const name = on ? (on.kind === "user" ? profiles[on.id]?.name : contacts[on.id]?.name) : null;

  if (!on) {
    return disabled ? (
      <span className="text-13 text-muted-foreground">—</span>
    ) : (
      <WaitingPicker task={task} onPick={(who) => setWaiting(task, who, defaultFollowUp(today))}>
        {button(t("waiting.set"), "text-muted-foreground")}
      </WaitingPicker>
    );
  }
  const due = followUpDue(task, today);
  return (
    <>
      <WaitingPicker task={task} onPick={(who) => setWaiting(task, who, task.follow_up_date)}>
        {button(
          <>
            {on.kind === "contact" ? <Building2 className="size-3.5 text-muted-foreground" /> : <UserAvatar profile={profiles[on.id]} size={18} />}
            <span className="truncate">{name ?? "…"}</span>
            {days !== null && <span className="text-muted-foreground tnum">· {t("waiting.days", { count: days })}</span>}
          </>,
        )}
      </WaitingPicker>
      <DatePicker value={task.follow_up_date} allowTime={false} onChange={(d) => setFollowUp(task, d)}>
        <button
          type="button"
          disabled={disabled}
          aria-label={t("waiting.followUp")}
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs tnum hover:bg-accent",
            due ? "border-warning/50 bg-warning-soft text-warning-fg" : "text-muted-foreground",
          )}
        >
          <BellRing className="size-3" />
          {task.follow_up_date ? `${t("waiting.followUpShort")}: ${f.relativeDay(task.follow_up_date)}` : t("waiting.followUp")}
        </button>
      </DatePicker>
      {!disabled && (
        <button type="button" onClick={() => setWaiting(task, null)} aria-label={t("waiting.clear")} className="rounded p-1 text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </>
  );
}

function WaitingPicker({ task, onPick, children }: { task: Task; onPick: (who: WaitingOn) => void; children: ReactNode }) {
  const t = useTranslations();
  const uid = useUserId();
  const role = useWorkspaceRole(task.workspace_id);
  const members = useMembers(task.workspace_id).filter((m) => m.id !== uid);
  const contacts = useContacts(task.workspace_id);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const current = waitingOn(task);
  const canContacts = isFullMember(role);
  const pick = (who: WaitingOn) => {
    onPick(who);
    setOpen(false);
    setSearch("");
  };
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="start">
        <Command filter={foldFilter}>
          <CommandInput placeholder={t("waiting.searchPlaceholder")} value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>{t("common.noResults")}</CommandEmpty>
            {members.length > 0 && (
              <CommandGroup heading={t("waiting.teammates")}>
                {members.map((p) => (
                  <CommandItem key={p.id} value={`u ${p.name} ${p.id}`} keywords={[p.name]} onSelect={() => pick({ kind: "user", id: p.id })}>
                    <UserAvatar profile={p} size={20} />
                    <span className="truncate">{p.name}</span>
                    {current?.kind === "user" && current.id === p.id && <Check className="ml-auto size-4 text-brand" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {canContacts && (
              <CommandGroup heading={t("contacts.title")}>
                {contacts.map((c) => (
                  <CommandItem key={c.id} value={`c ${c.name} ${c.company ?? ""} ${c.id}`} keywords={[c.name, c.company ?? ""]} onSelect={() => pick({ kind: "contact", id: c.id })}>
                    <Building2 className="size-4 text-muted-foreground" />
                    <span className="truncate">{c.name}</span>
                    {c.company && <span className="truncate text-xs text-muted-foreground">{c.company}</span>}
                    {current?.kind === "contact" && current.id === c.id && <Check className="ml-auto size-4 text-brand" />}
                  </CommandItem>
                ))}
                {search.trim() && (
                  <CommandItem
                    value={`new ${search}`}
                    keywords={[search]}
                    onSelect={() => {
                      const c = createContact({ workspaceId: task.workspace_id, name: search });
                      pick({ kind: "contact", id: c.id });
                    }}
                  >
                    <Plus className="size-4" /> {t("contacts.createNamed", { name: search.trim() })}
                  </CommandItem>
                )}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
