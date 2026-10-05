"use client";

import { useEffect } from "react";
import { toast } from "sonner";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { tr } from "@/lib/i18n-client";
import { logTime } from "./actions";
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
  sessions: { date: string; count: number };
  setTask: (id: string | null) => void;
  start: (workMin: number, breakMin: number) => void;
  pause: () => void;
  resume: () => void;
  stop: () => void;
  skipBreak: () => void;
}

const today = () => new Date().toISOString().slice(0, 10);

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
      sessions: { date: "", count: 0 },
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
          const remaining = s.running && s.endsAt ? Math.max(0, s.endsAt - Date.now()) : (s.remainingMs ?? 0);
          logWork(s.taskId, s.plannedMs - remaining, s.phaseStartedAt);
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
        sessions: s.sessions,
      }),
    },
  ),
);

function logWork(taskId: string | null, workedMs: number, startedAt: number) {
  const minutes = Math.round(workedMs / 60_000);
  if (!taskId || minutes < 1) return;
  const task = useStore.getState().data.tasks[taskId];
  if (!task) return;
  logTime(task, Math.min(minutes, 180), new Date(startedAt));
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
        if (s.phaseStartedAt) logWork(s.taskId, s.plannedMs, s.phaseStartedAt);
        const count = s.sessions.date === today() ? s.sessions.count + 1 : 1;
        const breakMs = (me?.pomodoro_break ?? 5) * 60_000;
        useFocus.setState({ phase: "break", endsAt: Date.now() + breakMs, plannedMs: breakMs, phaseStartedAt: Date.now(), sessions: { date: today(), count } });
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
