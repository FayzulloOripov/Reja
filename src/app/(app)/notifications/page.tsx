"use client";

import { AlarmClock, AtSign, Bell, CheckCheck, MessageSquare, RefreshCw, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { PageHeader, UserAvatar } from "@/components/common/bits";
import { EmptyState } from "@/components/common/empty-state";
import { PageContainer } from "@/components/shell/app-client";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFormat } from "@/lib/format";
import type { Notification, NotificationType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { markAllRead, markRead } from "@/store/actions";
import { useToday, useTz, useUserId } from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";

const ICON: Record<NotificationType, typeof Bell> = {
  assigned: UserPlus,
  mentioned: AtSign,
  due_soon: AlarmClock,
  overdue: AlarmClock,
  comment: MessageSquare,
  status_change: RefreshCw,
  invite: Users,
  reminder: Bell,
};

type Filter = "all" | "mentions" | "comments" | "assigned" | "reminders";

const FILTERS: { key: Exclude<Filter, "all">; icon: typeof Bell; types: NotificationType[] }[] = [
  { key: "mentions", icon: AtSign, types: ["mentioned"] },
  { key: "comments", icon: MessageSquare, types: ["comment"] },
  { key: "assigned", icon: UserPlus, types: ["assigned"] },
  { key: "reminders", icon: Bell, types: ["reminder", "due_soon", "overdue"] },
];

export default function NotificationsPage() {
  const t = useTranslations();
  const router = useRouter();
  const uid = useUserId();
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  const all = useStore((s) => s.data.notifications);
  const profiles = useStore((s) => s.data.profiles);
  const projects = useStore((s) => s.data.projects);
  const openTask = useUI((s) => s.openTask);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  const list = useMemo(
    () =>
      Object.values(all)
        .filter((n) => n.user_id === uid)
        .filter((n) => !unreadOnly || !n.read_at)
        .filter((n) => filter === "all" || FILTERS.find((x) => x.key === filter)!.types.includes(n.type))
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [all, uid, unreadOnly, filter],
  );
  const unread = useMemo(() => Object.values(all).filter((n) => n.user_id === uid && !n.read_at).length, [all, uid]);

  function open(n: Notification) {
    if (!n.read_at) markRead(n.id);
    if (n.task_id) openTask(n.task_id);
    else if (n.url) router.push(n.url);
  }

  const status = (n: Notification) => (n.type === "status_change" && n.body ? ` → ${t(`status.${n.body}` as never)}` : "");

  return (
    <PageContainer>
      <PageHeader
        title={t("notifications.title")}
        subtitle={unread ? `${unread} ${t("notifications.unread").toLowerCase()}` : undefined}
        icon={<span className="flex size-9 items-center justify-center rounded-xl bg-danger-soft text-danger-fg"><Bell className="size-5" /></span>}
        actions={
          unread > 0 && (
            <Button variant="outline" size="sm" className="bg-card" onClick={markAllRead}>
              <CheckCheck /> {t("notifications.markAllRead")}
            </Button>
          )
        }
      />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" value={unreadOnly ? "unread" : "all"} onValueChange={(v) => v && setUnreadOnly(v === "unread")} variant="outline" size="sm">
          <ToggleGroupItem value="all">{t("notifications.all")}</ToggleGroupItem>
          <ToggleGroupItem value="unread">{t("notifications.unread")}</ToggleGroupItem>
        </ToggleGroup>
        <ToggleGroup type="single" value={filter === "all" ? "" : filter} onValueChange={(v) => setFilter((v || "all") as Filter)} size="sm" aria-label={t("common.filter")} className="w-auto max-w-full flex-wrap">
          {FILTERS.map(({ key, icon: Icon }) => (
            <ToggleGroupItem key={key} value={key} className="gap-1.5">
              <Icon className="size-3.5" aria-hidden /> {t(`notifications.filters.${key}`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      {list.length === 0 ? (
        <EmptyState illustration="bell" title={t("notifications.empty")} body={t("notifications.emptyBody")} />
      ) : (
        <ul className="divide-y overflow-hidden rounded-2xl border bg-card shadow-elev-1">
          {list.map((n) => {
            const Icon = ICON[n.type];
            const actor = n.actor_id ? profiles[n.actor_id] : undefined;
            const project = n.project_id ? projects[n.project_id] : undefined;
            const isSystem = n.type === "reminder" || n.type === "due_soon" || n.type === "overdue";
            return (
              <li key={n.id}>
                <button onClick={() => open(n)} className={cn("flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/60", !n.read_at && "bg-brand-soft/40")}>
                  <span className="relative mt-0.5">
                    {actor ? (
                      <UserAvatar profile={actor} size={32} />
                    ) : (
                      <span className="flex size-8 items-center justify-center rounded-full bg-muted">
                        <Icon className="size-4 text-muted-foreground" />
                      </span>
                    )}
                    {actor && (
                      <span className="absolute -right-1 -bottom-1 flex size-4 items-center justify-center rounded-full bg-card ring-2 ring-card">
                        <Icon className="size-3 text-brand" />
                      </span>
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-13">
                      {isSystem ? (
                        <span className="font-semibold">{t(`notifications.type.${n.type}`)}</span>
                      ) : (
                        <>
                          <span className="font-semibold">{actor?.name ?? t("common.someone")}</span> <span className="text-muted-foreground">{t(`notifications.type.${n.type}`)}{status(n)}</span>
                        </>
                      )}
                    </span>
                    <span className="block truncate text-sm font-medium">{n.title}</span>
                    {n.body && n.type !== "status_change" && <span className="mt-0.5 line-clamp-2 block text-13 text-muted-foreground">{n.body}</span>}
                    <span className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      {f.ago(n.created_at)}
                      {project && <span className="truncate">· {project.name}</span>}
                    </span>
                  </span>
                  {!n.read_at && <span className="mt-2 size-2 shrink-0 rounded-full bg-brand" aria-label={t("notifications.unread")} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </PageContainer>
  );
}
