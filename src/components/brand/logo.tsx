"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

/** Reja mark: a warm tile with a check that rises like the sun over a horizon line. */
export function LogoMark({ className }: { className?: string }) {
  // unique per instance: a gradient defined inside a hidden copy (e.g. the desktop sidebar) is not rendered
  const id = `reja-g-${useId().replace(/:/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" className={cn("size-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.74 0.16 60)" />
          <stop offset="1" stopColor="oklch(0.56 0.17 38)" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${id})`} />
      <path d="M7 22.5h18" stroke="oklch(0.99 0.01 80 / 0.55)" strokeWidth="2" strokeLinecap="round" />
      <path d="M10 15.5l4 4 8-9" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, name = "Reja" }: { className?: string; name?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <LogoMark className="size-7" />
      <span className="font-display text-[17px] font-bold tracking-tight">{name}</span>
    </span>
  );
}
