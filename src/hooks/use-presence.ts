"use client";

import type { RealtimeChannel } from "@supabase/supabase-js";
import { useEffect, useMemo, useState } from "react";
import { DEMO_MODE } from "@/lib/env";
import { getBrowserSupabase } from "@/lib/supabase/client";
import type { Profile, Task } from "@/lib/types";
import { useProfiles, useUserId } from "@/store/hooks";

interface PresenceMeta {
  user_id: string;
  task_id: string | null;
  at: number;
}

type Listener = (state: PresenceMeta[]) => void;

// One private realtime channel per project, shared by every hook on the page.
const channels = new Map<string, { ch: RealtimeChannel; listeners: Set<Listener>; me: PresenceMeta; refs: number }>();

function join(projectId: string, userId: string, listener: Listener) {
  let entry = channels.get(projectId);
  if (!entry) {
    const sb = getBrowserSupabase();
    const ch = sb.channel(`project:${projectId}`, { config: { private: true, presence: { key: userId } } });
    const me: PresenceMeta = { user_id: userId, task_id: null, at: Date.now() };
    entry = { ch, listeners: new Set(), me, refs: 0 };
    const e = entry;
    ch.on("presence", { event: "sync" }, () => {
      const state = ch.presenceState<PresenceMeta>();
      const flat = Object.values(state).flat();
      e.listeners.forEach((l) => l(flat));
    });
    void sb.realtime.setAuth().then(() =>
      ch.subscribe((status) => {
        if (status === "SUBSCRIBED") void ch.track(e.me);
      }),
    );
    channels.set(projectId, entry);
  }
  entry.refs += 1;
  entry.listeners.add(listener);
  return entry;
}

function leave(projectId: string, listener: Listener) {
  const entry = channels.get(projectId);
  if (!entry) return;
  entry.listeners.delete(listener);
  entry.refs -= 1;
  if (entry.refs <= 0) {
    void getBrowserSupabase().removeChannel(entry.ch);
    channels.delete(projectId);
  }
}

function usePresenceState(projectId: string | null | undefined): PresenceMeta[] {
  const uid = useUserId();
  const [state, setState] = useState<PresenceMeta[]>([]);
  useEffect(() => {
    if (!projectId || !uid || DEMO_MODE) return;
    const l: Listener = (s) => setState(s);
    join(projectId, uid, l);
    return () => leave(projectId, l);
  }, [projectId, uid]);
  return state;
}

/** Other people currently looking at a project. */
export function useProjectPresence(projectId: string | null | undefined): Profile[] {
  const uid = useUserId();
  const profiles = useProfiles();
  const state = usePresenceState(projectId);
  return useMemo(() => {
    const ids = new Set(state.map((s) => s.user_id).filter((id) => id !== uid));
    return [...ids].map((id) => profiles[id]).filter(Boolean);
  }, [state, uid, profiles]);
}

/** Announce that I have this task open, and return others who have it open too. */
export function useTaskPresence(task: Pick<Task, "id" | "project_id">, editing: boolean): Profile[] {
  const uid = useUserId();
  const profiles = useProfiles();
  const state = usePresenceState(task.project_id);

  useEffect(() => {
    const entry = task.project_id ? channels.get(task.project_id) : undefined;
    if (!entry || DEMO_MODE) return;
    entry.me = { user_id: uid, task_id: editing ? task.id : null, at: Date.now() };
    void entry.ch.track(entry.me);
    return () => {
      const e = task.project_id ? channels.get(task.project_id) : undefined;
      if (e) {
        e.me = { ...e.me, task_id: null };
        void e.ch.track(e.me);
      }
    };
  }, [task.id, task.project_id, editing, uid]);

  return useMemo(() => {
    const ids = new Set(state.filter((s) => s.task_id === task.id && s.user_id !== uid).map((s) => s.user_id));
    return [...ids].map((id) => profiles[id]).filter(Boolean);
  }, [state, task.id, uid, profiles]);
}
