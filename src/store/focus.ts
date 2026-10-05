"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tr } from "@/lib/i18n-client";
import { logFocusSession, logTime } from "./actions";
import { useStore } from "./store";

export interface FocusState {
  taskId: string | null;
  phase: "work" | "break";
  running: boolean;
  /** epoch ms when the phase ends (while running) */
  endsAt: number | null;
  /** ms left (while paused) */
  remainingMs: number | null;
  /** length of the current phase */
  plannedMs: number;
  phaseStartedAt: number | null;
  setTask: (id: string | null) => void;
  start: (workMin: number, breakMin: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipBreak: () => void;
}

export const useFocus = create<FocusState>()(
  persist(
    (set, get) => ({
      taskId: null,
      phase: "work",
      running: false,
      endsAt: null,
      remainingMs: null,
      plannedMs: 25 * 60_000,
      phaseStartedAt: null,
      setTask: (id) => set({ taskId: id }),
      start: (workMin, breakMin) => {
        const ms = (get().phase === "work" ? workMin : breakMin) * 60_000;
        set({ running: true, endsAt: Date.now() + ms, remainingMs: null, plannedMs: ms, phaseStartedAt: Date.now() });
      },
      pause: () => {
        const { endsAt } = get();
        if (endsAt) set({ running: false, remainingMs: Math.max(0, endsAt - Date.now()), endsAt: null });
      },
      resume: () => {
        const { remainingMs } = get();
        if (remainingMs !== null) set({ running: true, endsAt: Date.now() + remainingMs, remainingMs: null });
      },
      stop: () => {
        const s = get();
        if (s.phase === "work" && s.phaseStartedAt) {
          // a stopped session is not a finished focus session: its time goes to the task only
          const remaining = s.running && s.endsAt ? Math.max(0, s.endsAt - Date.now()) : (s.remainingMs ?? 0);
          logPartial(s.taskId, s.plannedMs - remaining, s.phaseStartedAt);
        }
        set({ running: false, endsAt: null, remainingMs: null, phase: "work", phaseStartedAt: null });
      },
      skipBreak: () => set({ phase: "work", running: false, endsAt: null, remainingMs: null, phaseStartedAt: null }),
    }),
    {
      name: "reja:focus",
      partialize: (s) => ({
        taskId: s.taskId,
        phase: s.phase,
        running: s.running,
        endsAt: s.endsAt,
        remainingMs: s.remainingMs,
        plannedMs: s.plannedMs,
        phaseStartedAt: s.phaseStartedAt,
      }),
    },
  ),
);

/** A finished work phase: stored as a focus session (with or without a task). */
function logSession(taskId: string | null, workedMs: number, startedAt: number) {
  const minutes = Math.min(180, Math.round(workedMs / 60_000));
  if (minutes < 1) return;
  const task = taskId ? useStore.getState().data.tasks[taskId] : undefined;
  logFocusSession(task ?? null, minutes, new Date(startedAt));
  if (task) toast.success(tr("focus.logged", { minutes, title: task.title }));
}

function logPartial(taskId: string | null, workedMs: number, startedAt: number) {
  const minutes = Math.min(180, Math.round(workedMs / 60_000));
  const task = taskId ? useStore.getState().data.tasks[taskId] : undefined;
  if (!task || minutes < 1) return;
  logTime(task, minutes, new Date(startedAt));
  toast.success(tr("focus.logged", { minutes, title: task.title }));
}

function notify(body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.visibilityState !== "visible") {
      new Notification("Reja", { body, icon: "/icons/icon-192.png" });
    }
  } catch {
    // notifications unavailable
  }
}

/** Mounted once in the app shell: moves the timer between phases and logs time. */
export function useFocusEngine() {
  useEffect(() => {
    const id = setInterval(() => {
      const s = useFocus.getState();
      if (!s.running || !s.endsAt || Date.now() < s.endsAt) return;
      const st = useStore.getState();
      const me = st.data.profiles[st.userId ?? ""];
      if (s.phase === "work") {
        if (s.phaseStartedAt) logSession(s.taskId, s.plannedMs, s.phaseStartedAt);
        // the break starts when the work phase ended (the screen may have been locked)
        const breakMs = (me?.pomodoro_break ?? 5) * 60_000;
        const endsAt = s.endsAt + breakMs;
        if (endsAt <= Date.now()) useFocus.setState({ phase: "work", running: false, endsAt: null, phaseStartedAt: null });
        else useFocus.setState({ phase: "break", endsAt, plannedMs: breakMs, phaseStartedAt: s.endsAt });
        toast(tr("focus.breakTime"));
        notify(tr("focus.breakTime"));
      } else {
        useFocus.setState({ phase: "work", running: false, endsAt: null, phaseStartedAt: null });
        toast(tr("focus.workTime"));
        notify(tr("focus.workTime"));
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);
}
