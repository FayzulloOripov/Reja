"use client";

import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  CalendarClock,
  ChevronsUp,
  CircleDashed,
  Equal,
  Flag,
  Hourglass,
  Repeat,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { safeColor, colorFor } from "@/lib/colors";
import { diffDays } from "@/lib/dates";
import { useFormat } from "@/lib/format";
import { initials } from "@/lib/text";
import type { Profile, TaskPriority, TaskStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useToday, useTz } from "@/store/hooks";

export function ProjectDot({ color, className, size = "md" }: { color?: string | null; className?: string; size?: "sm" | "md" | "lg" }) {
  return (
    <span
      data-color={safeColor(color)}
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full bg-pc",
        size === "sm" ? "size-2" : size === "lg" ? "size-3" : "size-2.5",
        className,
      )}
    />
  );
}

export function ProjectBadge({ name, color, className }: { name: string; color?: string | null; className?: string }) {
  return (
    <span
      data-color={safeColor(color)}
      className={cn("inline-flex max-w-[12rem] items-center gap-1.5 truncate rounded-md bg-pc-soft px-1.5 py-0.5 text-xs font-medium text-pc-fg", className)}
    >
      <span className="size-1.5 shrink-0 rounded-full bg-pc" aria-hidden />
      <span className="truncate">{name}</span>
    </span>
  );
}

export function UserAvatar({ profile, size = 24, className, ring }: { profile?: Pick<Profile, "id" | "name" | "avatar_url"> | null; size?: number; className?: string; ring?: boolean }) {
  const color = colorFor(profile?.id ?? "x");
  const style = { width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.4)) };
  if (profile?.avatar_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={profile.avatar_url}
        alt={profile.name}
        title={profile.name}
        style={style}
        referrerPolicy="no-referrer"
        className={cn("shrink-0 rounded-full object-cover", ring && "ring-2 ring-background", className)}
      />
    );
  }
  return (
    <span
      data-color={color}
      title={profile?.name}
      role="img"
      aria-label={profile?.name ?? ""}
      style={style}
      className={cn("inline-flex shrink-0 items-center justify-center rounded-full bg-pc-soft font-semibold text-pc-fg", ring && "ring-2 ring-background", className)}
    >
      {initials(profile?.name)}
    </span>
  );
}

export function AvatarStack({ people, max = 3, size = 22 }: { people: Pick<Profile, "id" | "name" | "avatar_url">[]; max?: number; size?: number }) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <span className="flex -space-x-1.5">
      {shown.map((p) => (
        <UserAvatar key={p.id} profile={p} size={size} ring />
      ))}
      {rest > 0 && (
        <span
          className="inline-flex items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground ring-2 ring-background"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </span>
  );
}

const PRIORITY_STYLE: Record<TaskPriority, { icon: typeof Flag; className: string }> = {
  urgent: { icon: ChevronsUp, className: "text-prio-urgent" },
  high: { icon: ArrowUp, className: "text-prio-high" },
  medium: { icon: Equal, className: "text-prio-medium" },
  low: { icon: ArrowDown, className: "text-prio-low" },
  none: { icon: Flag, className: "text-subtle-foreground" },
};

/** Priority is shown by shape (arrows) and colour, so it reads without colour vision. */
export function PriorityIcon({ priority, className, withLabel }: { priority: TaskPriority; className?: string; withLabel?: boolean }) {
  const t = useTranslations("priority");
  const { icon: Icon, className: tone } = PRIORITY_STYLE[priority];
  return (
    <span className={cn("inline-flex items-center gap-1", tone, className)} title={t(priority)}>
      <Icon className="size-3.5" strokeWidth={2.5} aria-hidden />
      {withLabel ? <span className="text-xs font-medium">{t(priority)}</span> : <span className="sr-only">{t(priority)}</span>}
    </span>
  );
}

export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const t = useTranslations("status");
  const map: Record<TaskStatus, ReactNode> = {
    todo: <CircleDashed className="size-3.5 text-muted-foreground" />,
    in_progress: (
      <svg viewBox="0 0 16 16" className="size-3.5 text-info">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 3.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" />
      </svg>
    ),
    waiting: <Hourglass className="size-3.5 text-warning-fg" />,
    done: (
      <svg viewBox="0 0 16 16" className="size-3.5 text-success">
        <circle cx="8" cy="8" r="7" fill="currentColor" />
        <path d="M5 8.2l2 2 4-4.4" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    cancelled: (
      <svg viewBox="0 0 16 16" className="size-3.5 text-muted-foreground">
        <circle cx="8" cy="8" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  };
  return (
    <span className={cn("inline-flex", className)} title={t(status)}>
      {map[status]}
      <span className="sr-only">{t(status)}</span>
    </span>
  );
}

/** Due date chip: overdue is red with an alarm icon, today is warm, future is neutral. */
export function DueChip({
  date,
  dueAt,
  deadline,
  recurring,
  done,
  className,
}: {
  date: string | null;
  dueAt?: string | null;
  deadline?: string | null;
  recurring?: boolean;
  done?: boolean;
  className?: string;
}) {
  const today = useToday();
  const tz = useTz();
  const f = useFormat(today, tz);
  if (!date && !deadline) return null;
  const diff = date ? diffDays(today, date) : null;
  const overdue = !done && diff !== null && diff < 0;
  const isToday = diff === 0;
  const deadlineSoon = !done && deadline && diffDays(today, deadline) <= 2;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs tnum", className)}>
      {date && (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-medium",
            overdue ? "bg-danger-soft text-danger-fg" : isToday ? "bg-brand-soft text-brand-fg" : "text-muted-foreground",
          )}
        >
          {overdue ? <AlarmClock className="size-3" aria-hidden /> : <CalendarClock className="size-3" aria-hidden />}
          {f.relativeDay(date)}
          {dueAt ? ` ${f.time(dueAt)}` : ""}
          {recurring && <Repeat className="size-3 opacity-70" aria-label="↻" />}
        </span>
      )}
      {deadline && (
        <span className={cn("inline-flex items-center gap-1 font-medium", deadlineSoon ? "text-danger-fg" : "text-muted-foreground")}>
          <Flag className="size-3" aria-hidden />
          {f.dayMonth(deadline)}
        </span>
      )}
    </span>
  );
}

export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn("inline-flex h-5 min-w-5 items-center justify-center rounded border border-border-strong bg-muted px-1 font-sans text-[11px] font-medium text-muted-foreground", className)}>
      {children}
    </kbd>
  );
}

export function PageHeader({
  title,
  subtitle,
  actions,
  icon,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-wrap items-end justify-between gap-3 pb-5", className)}>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2.5">
          {icon}
          <h1 className="truncate text-22 font-bold sm:text-28">{title}</h1>
        </div>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Section({ title, count, actions, children, className, tone }: { title: ReactNode; count?: number; actions?: ReactNode; children: ReactNode; className?: string; tone?: "danger" }) {
  return (
    <section className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2 px-1">
        <h2 className={cn("flex items-center gap-2 font-sans text-13 font-semibold tracking-normal", tone === "danger" ? "text-danger-fg" : "text-muted-foreground")}>
          {title}
          {count !== undefined && <span className="tnum rounded-full bg-muted px-1.5 text-2xs font-semibold text-muted-foreground">{count}</span>}
        </h2>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function ProgressBar({ value, color, className, label }: { value: number; color?: string | null; className?: string; label?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div
      role="progressbar"
      aria-valuenow={v}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      data-color={color ? safeColor(color) : undefined}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <div className={cn("h-full rounded-full transition-[width] duration-500 ease-out", color ? "bg-pc" : "bg-brand")} style={{ width: `${v}%` }} />
    </div>
  );
}
