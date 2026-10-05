"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function SettingsCard({ title, description, children, className, actions }: { title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; actions?: ReactNode }) {
  return (
    <section className={cn("rounded-2xl border bg-card shadow-elev-1", className)}>
      <header className="flex items-start justify-between gap-3 border-b px-5 py-4">
        <div>
          <h2 className="font-sans text-base font-semibold tracking-normal">{title}</h2>
          {description && <p className="mt-0.5 text-13 text-muted-foreground">{description}</p>}
        </div>
        {actions}
      </header>
      <div className="divide-y">{children}</div>
    </section>
  );
}

export function SettingsRow({ label, description, children, htmlFor }: { label: ReactNode; description?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
      <div className="min-w-0">
        <label htmlFor={htmlFor} className="text-sm font-medium">{label}</label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function timeValue(t: string | null | undefined) {
  return (t ?? "").slice(0, 5);
}
