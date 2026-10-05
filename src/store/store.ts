"use client";

import { del, get, set } from "idb-keyval";
import { create } from "zustand";
import {
  AdapterError,
  emptyData,
  keyOf,
  PK,
  type ChangeEvent,
  type DataAdapter,
  type Op,
  type Row,
  type StoreData,
  type TableName,
} from "./tables";

export type SyncStatus = "idle" | "cached" | "loading" | "ready" | "error";

export interface MutationInput<T extends TableName = TableName> {
  table: T;
  kind: "insert" | "update" | "delete";
  /** full row for insert, the key columns (+ values) for update/delete */
  row: Partial<Row<T>>;
  values?: Partial<Row<T>>;
}

interface StoreState {
  userId: string | null;
  adapter: DataAdapter | null;
  data: StoreData;
  status: SyncStatus;
  error: string | null;
  outbox: Op[];
  online: boolean;
  flushing: boolean;
  lastSyncedAt: number | null;
  loadedDetail: Record<string, true>;
}

export const useStore = create<StoreState>(() => ({
  userId: null,
  adapter: null,
  data: emptyData(),
  status: "idle",
  error: null,
  outbox: [],
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  flushing: false,
  lastSyncedAt: null,
  loadedDetail: {},
}));

const getState = useStore.getState;
const setState = useStore.setState;

// ------------------------------------------------------------------ error reporting hook
type ErrorListener = (err: AdapterError, op: Op) => void;
let onOpError: ErrorListener = () => {};
export function setOpErrorListener(fn: ErrorListener) {
  onOpError = fn;
}

// ------------------------------------------------------------------ persistence
const SNAPSHOT_VERSION = 3;
const snapshotKey = (uid: string) => `reja:snapshot:v${SNAPSHOT_VERSION}:${uid}`;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const { userId, data, outbox, lastSyncedAt } = getState();
    if (!userId) return;
    // comments/attachments/activity are fetched on demand and not needed offline
    const slim = { ...data, comments: {}, comment_reactions: {}, attachments: {}, activity_log: {} };
    void set(snapshotKey(userId), { data: slim, outbox, lastSyncedAt }).catch(() => {});
  }, 400);
}

useStore.subscribe((s, prev) => {
  if (s.data !== prev.data || s.outbox !== prev.outbox) schedulePersist();
});

export async function clearSnapshot(uid: string) {
  await del(snapshotKey(uid)).catch(() => {});
}

// ------------------------------------------------------------------ local apply

function applyLocal(data: StoreData, op: Op): StoreData {
  const table = op.table;
  const k = PK[table].map((c) => op.key[c]).join("|");
  const current = data[table] as unknown as Record<string, Record<string, unknown>>;
  const next = { ...current };
  if (op.kind === "delete") {
    delete next[k];
  } else if (op.kind === "insert") {
    next[k] = { ...(op.values ?? {}) };
  } else {
    const prev = current[k];
    if (!prev) return data;
    next[k] = { ...prev, ...(op.values ?? {}) };
  }
  return { ...data, [table]: next };
}

function rollback(data: StoreData, op: Op): StoreData {
  const table = op.table;
  const k = PK[table].map((c) => op.key[c]).join("|");
  const next = { ...(data[table] as Record<string, unknown>) };
  if (op.prev) next[k] = op.prev;
  else delete next[k];
  return { ...data, [table]: next };
}

let opCounter = 0;
function newOpId() {
  opCounter += 1;
  return `${Date.now().toString(36)}-${opCounter}`;
}

/**
 * Apply mutations optimistically and queue them for the server.
 * Returns the inverse mutations, ready to be passed back for undo.
 */
export function mutate(inputs: MutationInput[]): MutationInput[] {
  const state = getState();
  let data = state.data;
  const ops: Op[] = [];
  const inverse: MutationInput[] = [];

  for (const input of inputs) {
    const table = input.table;
    const pkCols = PK[table];
    const key: Record<string, string> = {};
    for (const c of pkCols) key[c] = String((input.row as Record<string, unknown>)[c]);
    const k = pkCols.map((c) => key[c]).join("|");
    const prev = (data[table] as unknown as Record<string, Record<string, unknown>>)[k] ?? null;

    let values: Record<string, unknown> | undefined;
    if (input.kind === "insert") values = { ...(input.row as Record<string, unknown>) };
    else if (input.kind === "update") values = { ...((input.values ?? {}) as Record<string, unknown>) };

    const op: Op = { opId: newOpId(), table, kind: input.kind, key, values, prev, ts: Date.now() };
    data = applyLocal(data, op);
    ops.push(op);

    if (input.kind === "insert") {
      inverse.unshift({ table, kind: "delete", row: key as Partial<Row<typeof table>> });
    } else if (input.kind === "delete" && prev) {
      inverse.unshift({ table, kind: "insert", row: prev as Partial<Row<typeof table>> });
    } else if (input.kind === "update" && prev) {
      const restore: Record<string, unknown> = {};
      for (const col of Object.keys(values ?? {})) restore[col] = prev[col] ?? null;
      inverse.unshift({ table, kind: "update", row: key as Partial<Row<typeof table>>, values: restore as Partial<Row<typeof table>> });
    }
  }

  setState({ data, outbox: [...state.outbox, ...ops] });
  void flush();
  return inverse;
}

// ------------------------------------------------------------------ outbox flush

let retryTimer: ReturnType<typeof setTimeout> | null = null;

export async function flush(): Promise<void> {
  const s = getState();
  if (s.flushing || !s.adapter || s.outbox.length === 0) return;
  setState({ flushing: true });
  try {
    while (getState().outbox.length > 0) {
      const op = getState().outbox[0];
      try {
        await getState().adapter!.exec(op);
        setState((st) => ({ outbox: st.outbox.filter((o) => o.opId !== op.opId), online: true }));
      } catch (e) {
        const err = e instanceof AdapterError ? e : new AdapterError(String((e as Error)?.message ?? e));
        if (err.network) {
          // keep the op queued; try again when the connection is back
          setState({ online: false });
          if (retryTimer) clearTimeout(retryTimer);
          retryTimer = setTimeout(() => void flush(), 15_000);
          return;
        }
        // permanent failure: undo the optimistic change and drop the op
        setState((st) => ({
          outbox: st.outbox.filter((o) => o.opId !== op.opId),
          data: rollback(st.data, op),
        }));
        onOpError(err, op);
      }
    }
  } finally {
    setState({ flushing: false });
  }
}

// ------------------------------------------------------------------ realtime

function hasPending(table: TableName, k: string): boolean {
  return getState().outbox.some((o) => o.table === table && PK[table].map((c) => o.key[c]).join("|") === k);
}

export function applyChange(ev: ChangeEvent) {
  const { table } = ev;
  const src = (ev.row ?? ev.old) as Partial<Row<typeof table>> | undefined;
  if (!src) return;
  const k = keyOf(table, src);
  if (hasPending(table, k)) return; // our own optimistic state wins until the op is flushed
  setState((st) => {
    const next = { ...(st.data[table] as Record<string, unknown>) };
    if (ev.type === "DELETE") delete next[k];
    else next[k] = ev.row;
    return { data: { ...st.data, [table]: next } };
  });
}

export function mergeRows(partial: Partial<StoreData>) {
  setState((st) => {
    const data = { ...st.data };
    for (const [table, rows] of Object.entries(partial) as [TableName, Record<string, unknown>][]) {
      data[table] = { ...(data[table] as Record<string, unknown>), ...rows } as never;
    }
    return { data };
  });
}

// ------------------------------------------------------------------ bootstrap

let unsubscribeRealtime: (() => void) | null = null;
let subscribedKey = "";

function reapplyOutbox(data: StoreData, outbox: Op[]): StoreData {
  let d = data;
  for (const op of outbox) d = applyLocal(d, op);
  return d;
}

export async function bootstrap(userId: string, adapter: DataAdapter) {
  const prevUser = getState().userId;
  if (prevUser === userId && getState().adapter === adapter && getState().status !== "idle") return;

  setState({ userId, adapter, status: "loading", error: null });

  // 1) cached snapshot for instant (and offline) rendering
  try {
    const snap = (await get(snapshotKey(userId))) as
      | { data: StoreData; outbox: Op[]; lastSyncedAt: number | null }
      | undefined;
    if (snap?.data) {
      setState({
        data: { ...emptyData(), ...snap.data },
        outbox: snap.outbox ?? [],
        lastSyncedAt: snap.lastSyncedAt ?? null,
        status: "cached",
      });
    }
  } catch {
    // IndexedDB unavailable (private mode): continue with network only
  }

  await refresh();
  void flush();
}

export async function refresh() {
  const { adapter, userId } = getState();
  if (!adapter || !userId) return;
  try {
    const fresh = await adapter.loadAll(userId);
    setState((st) => {
      const base = { ...emptyData(), ...fresh };
      // keep lazily-loaded detail rows
      base.comments = st.data.comments;
      base.comment_reactions = st.data.comment_reactions;
      base.attachments = st.data.attachments;
      base.activity_log = st.data.activity_log;
      return {
        data: reapplyOutbox(base, st.outbox),
        status: "ready",
        online: true,
        lastSyncedAt: Date.now(),
        error: null,
      };
    });
    resubscribe();
  } catch (e) {
    const err = e as AdapterError;
    setState((st) => ({
      status: st.status === "cached" ? "cached" : "error",
      online: err.network ? false : st.online,
      error: err.message,
    }));
  }
}

export function resubscribe() {
  const { adapter, userId, data } = getState();
  if (!adapter || !userId) return;
  const wsIds = Object.values(data.workspace_members)
    .filter((m) => m.user_id === userId)
    .map((m) => m.workspace_id)
    .sort();
  const key = `${userId}:${wsIds.join(",")}`;
  if (key === subscribedKey && unsubscribeRealtime) return;
  unsubscribeRealtime?.();
  subscribedKey = key;
  unsubscribeRealtime = adapter.subscribe(userId, wsIds, (ev) => {
    applyChange(ev);
    if (ev.table === "workspace_members") resubscribe();
  });
}

export function teardown() {
  unsubscribeRealtime?.();
  unsubscribeRealtime = null;
  subscribedKey = "";
  setState({ userId: null, adapter: null, data: emptyData(), status: "idle", outbox: [], loadedDetail: {} });
}

export async function ensureTaskDetail(taskId: string, force = false) {
  const { adapter, loadedDetail } = getState();
  if (!adapter || (!force && loadedDetail[taskId])) return;
  try {
    const rows = await adapter.loadTaskDetail(taskId);
    mergeRows(rows);
    setState((st) => ({ loadedDetail: { ...st.loadedDetail, [taskId]: true } }));
  } catch {
    // offline: the panel simply shows no comments yet
  }
}

// connectivity
if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    setState({ online: true });
    void flush();
    void refresh();
  });
  window.addEventListener("offline", () => setState({ online: false }));
  document.addEventListener("visibilitychange", () => {
    const { lastSyncedAt, status } = getState();
    if (document.visibilityState === "visible" && status !== "idle" && (!lastSyncedAt || Date.now() - lastSyncedAt > 5 * 60_000)) {
      void refresh();
    }
  });
}
