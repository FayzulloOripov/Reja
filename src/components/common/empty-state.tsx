"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type IllustrationName =
  | "inbox"
  | "today"
  | "calendar"
  | "notes"
  | "team"
  | "chart"
  | "sprout"
  | "target"
  | "bell"
  | "trash"
  | "search"
  | "board"
  | "folder"
  | "done";

// Line art uses the foreground; fills use theme tokens so illustrations adapt to dark mode.
const ink = "var(--foreground)";
const soft = "var(--brand-soft)";
const accent = "var(--brand)";
const paper = "var(--card)";

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 160 120" className="h-28 w-auto" aria-hidden="true" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="80" cy="66" rx="66" ry="46" fill={soft} />
      <ellipse cx="80" cy="108" rx="44" ry="4" fill={ink} opacity="0.06" />
      {children}
    </svg>
  );
}

const illustrations: Record<IllustrationName, ReactNode> = {
  inbox: (
    <Frame>
      <path d="M44 62l10-22h52l10 22v26a4 4 0 0 1-4 4H48a4 4 0 0 1-4-4z" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M44 62h22a14 14 0 0 0 28 0h22" stroke={ink} strokeWidth="2" />
      <rect x="62" y="22" width="36" height="26" rx="3" fill={paper} stroke={ink} strokeWidth="2" transform="rotate(-6 80 35)" />
      <path d="M69 32h18M69 39h12" stroke={accent} strokeWidth="2.5" transform="rotate(-6 80 35)" />
    </Frame>
  ),
  today: (
    <Frame>
      <circle cx="112" cy="34" r="12" fill={accent} opacity="0.9" />
      <path d="M112 14v-4M128 34h4M124 22l3-3M100 22l-3-3" stroke={accent} strokeWidth="2.5" />
      <rect x="40" y="38" width="62" height="58" rx="6" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M50 54l4 4 7-8" stroke="var(--success)" strokeWidth="2.5" />
      <path d="M68 55h24" stroke={ink} strokeWidth="2" opacity="0.5" />
      <path d="M50 70l4 4 7-8" stroke="var(--success)" strokeWidth="2.5" />
      <path d="M68 71h18" stroke={ink} strokeWidth="2" opacity="0.5" />
      <rect x="50" y="83" width="8" height="8" rx="2" stroke={ink} strokeWidth="2" />
      <path d="M68 87h20" stroke={ink} strokeWidth="2" opacity="0.5" />
    </Frame>
  ),
  calendar: (
    <Frame>
      <rect x="42" y="30" width="76" height="66" rx="8" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M42 46h76" stroke={ink} strokeWidth="2" />
      <path d="M58 24v12M102 24v12" stroke={ink} strokeWidth="2.5" />
      {[0, 1, 2, 3].map((r) =>
        [0, 1, 2, 3, 4].map((c) => (
          <rect key={`${r}${c}`} x={50 + c * 13} y={54 + r * 10} width="8" height="5" rx="1.5" fill={r === 1 && c === 2 ? accent : ink} opacity={r === 1 && c === 2 ? 1 : 0.12} />
        )),
      )}
    </Frame>
  ),
  notes: (
    <Frame>
      <rect x="48" y="26" width="58" height="72" rx="5" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M58 42h38M58 52h38M58 62h26" stroke={ink} strokeWidth="2" opacity="0.45" />
      <path d="M100 76l18-18 6 6-18 18-8 2z" fill={accent} stroke={ink} strokeWidth="2" />
    </Frame>
  ),
  team: (
    <Frame>
      <circle cx="62" cy="50" r="12" fill="var(--pc-sky-soft)" stroke={ink} strokeWidth="2" />
      <circle cx="98" cy="50" r="12" fill="var(--pc-violet-soft)" stroke={ink} strokeWidth="2" />
      <path d="M40 92a22 22 0 0 1 44 0M76 92a22 22 0 0 1 44 0" fill={paper} stroke={ink} strokeWidth="2" />
      <circle cx="80" cy="30" r="7" fill={accent} />
      <path d="M77 30l2 2 4-4" stroke="white" strokeWidth="2" />
    </Frame>
  ),
  chart: (
    <Frame>
      <path d="M42 96h80" stroke={ink} strokeWidth="2" />
      <rect x="50" y="66" width="12" height="30" rx="3" fill="var(--pc-sky)" opacity="0.8" />
      <rect x="70" y="52" width="12" height="44" rx="3" fill="var(--pc-violet)" opacity="0.8" />
      <rect x="90" y="38" width="12" height="58" rx="3" fill={accent} />
      <path d="M52 56l20-14 20 4 22-20" stroke={ink} strokeWidth="2" />
      <circle cx="114" cy="26" r="4" fill={paper} stroke={ink} strokeWidth="2" />
    </Frame>
  ),
  sprout: (
    <Frame>
      <path d="M58 96h44l-5-22H63z" fill={accent} stroke={ink} strokeWidth="2" />
      <path d="M80 74V48" stroke={ink} strokeWidth="2.5" />
      <path d="M80 56c-14 0-20-8-20-18 12 0 20 6 20 18zM80 50c0-12 8-20 22-20 0 12-8 20-22 20z" fill="var(--pc-lime)" stroke={ink} strokeWidth="2" />
    </Frame>
  ),
  target: (
    <Frame>
      <circle cx="78" cy="64" r="30" fill={paper} stroke={ink} strokeWidth="2" />
      <circle cx="78" cy="64" r="19" stroke={accent} strokeWidth="3" />
      <circle cx="78" cy="64" r="7" fill={accent} />
      <path d="M78 64l34-34M104 30h8v8" stroke={ink} strokeWidth="2.5" />
    </Frame>
  ),
  bell: (
    <Frame>
      <path d="M58 82V60a22 22 0 0 1 44 0v22l6 6H52z" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M72 94a8 8 0 0 0 16 0" stroke={ink} strokeWidth="2" />
      <circle cx="104" cy="40" r="8" fill={accent} />
    </Frame>
  ),
  trash: (
    <Frame>
      <path d="M54 44h52l-5 50a4 4 0 0 1-4 4H63a4 4 0 0 1-4-4z" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M48 44h64M70 36h20" stroke={ink} strokeWidth="2.5" />
      <path d="M70 56v30M80 56v30M90 56v30" stroke={ink} strokeWidth="2" opacity="0.35" />
    </Frame>
  ),
  search: (
    <Frame>
      <circle cx="72" cy="58" r="22" fill={paper} stroke={ink} strokeWidth="2.5" />
      <path d="M88 74l20 20" stroke={ink} strokeWidth="4" />
      <path d="M63 52a10 10 0 0 1 10-6" stroke={accent} strokeWidth="2.5" />
    </Frame>
  ),
  board: (
    <Frame>
      {[0, 1, 2].map((c) => (
        <g key={c}>
          <rect x={40 + c * 28} y="30" width="24" height="66" rx="4" fill={paper} stroke={ink} strokeWidth="2" />
          <rect x={44 + c * 28} y={38 + c * 6} width="16" height="10" rx="2" fill={c === 1 ? accent : "var(--pc-sky-soft)"} />
          {c !== 2 && <rect x={44 + c * 28} y={54 + c * 6} width="16" height="10" rx="2" fill="var(--pc-emerald-soft)" />}
        </g>
      ))}
    </Frame>
  ),
  folder: (
    <Frame>
      <path d="M40 44a4 4 0 0 1 4-4h22l8 8h42a4 4 0 0 1 4 4v40a4 4 0 0 1-4 4H44a4 4 0 0 1-4-4z" fill={paper} stroke={ink} strokeWidth="2" />
      <path d="M40 58h80" stroke={ink} strokeWidth="2" opacity="0.4" />
      <circle cx="80" cy="76" r="9" fill={accent} />
      <path d="M80 72v8M76 76h8" stroke="white" strokeWidth="2.5" />
    </Frame>
  ),
  done: (
    <Frame>
      <circle cx="80" cy="62" r="30" fill="var(--success)" />
      <path d="M66 62l10 10 20-22" stroke="white" strokeWidth="5" />
      <path d="M40 34l4 4M120 34l-4 4M36 72h6M118 72h6M80 18v6" stroke={accent} strokeWidth="2.5" />
    </Frame>
  ),
};

export function Illustration({ name, className }: { name: IllustrationName; className?: string }) {
  return <div className={cn("flex justify-center", className)}>{illustrations[name]}</div>;
}

export function EmptyState({
  illustration,
  title,
  body,
  action,
  className,
  compact,
}: {
  illustration: IllustrationName;
  title: ReactNode;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex flex-col items-center px-6 text-center", compact ? "py-6" : "py-12", className)}>
      {!compact && <Illustration name={illustration} className="mb-4" />}
      <h3 className="font-sans text-base font-semibold tracking-normal">{title}</h3>
      {body && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
