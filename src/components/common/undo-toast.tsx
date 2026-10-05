"use client";

import { RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { tr } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";

export const UNDO_DURATION = 8_000;

/**
 * Toast with an undo button. It stays 8 seconds, and the timer pauses while the toast is hovered,
 * touched or focused, so reaching for "Qaytarish" never races the timer.
 */
function UndoToast({ id, message, onUndo, duration }: { id: string | number; message: string; onUndo: () => void; duration: number }) {
  const remaining = useRef(duration);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => toast.dismiss(id), remaining.current);
    return () => {
      if (timer.current) clearTimeout(timer.current);
      remaining.current = Math.max(1_500, remaining.current - (Date.now() - startedAt.current));
    };
  }, [paused, id]);

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);

  return (
    <div
      role="status"
      aria-live="polite"
      onPointerEnter={pause}
      onPointerLeave={resume}
      onTouchStart={pause}
      onTouchEnd={() => setTimeout(resume, 1_500)}
      onFocus={pause}
      onBlur={resume}
      className="relative flex w-[min(92vw,380px)] items-center gap-2 overflow-hidden rounded-xl border bg-popover py-1.5 pr-1.5 pl-4 text-sm text-popover-foreground shadow-elev-4"
    >
      <p className="min-w-0 flex-1 py-1.5 leading-snug">{message}</p>
      <button
        type="button"
        onClick={() => {
          onUndo();
          toast.dismiss(id);
        }}
        className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 font-semibold text-brand-fg hover:bg-brand-soft"
      >
        <RotateCcw className="size-4" aria-hidden />
        {tr("common.undo")}
      </button>
      <button
        type="button"
        onClick={() => toast.dismiss(id)}
        aria-label={tr("common.close")}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        <X className="size-4" aria-hidden />
      </button>
      <span
        aria-hidden
        className={cn("undo-progress absolute inset-x-0 bottom-0 h-0.5 origin-left bg-brand/60 motion-reduce:hidden", paused && "[animation-play-state:paused]")}
        style={{ animationDuration: `${duration}ms` }}
      />
    </div>
  );
}

export function showUndo(message: string, onUndo: () => void, duration = UNDO_DURATION) {
  return toast.custom((id) => <UndoToast id={id} message={message} onUndo={onUndo} duration={duration} />, { duration: Infinity });
}
