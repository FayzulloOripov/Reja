import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { blockToGoogleEvent, mapGoogleEvent, planBlockPush, SYNC_FUTURE_DAYS, SYNC_PAST_DAYS, type GoogleEvent } from "@/lib/google-calendar";
import { serverEnv } from "./env";

// Two-way Google Calendar for one user: pull busy time, push time blocks marked «Google Calendar'ga».
// Tokens live in google_connections, which only the service role can read.

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://www.googleapis.com/calendar/v3";

interface Connection {
  user_id: string;
  calendar_id: string;
  refresh_token: string;
  access_token: string | null;
  access_expires_at: string | null;
  last_synced_at: string | null;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: serverEnv.googleClientId, client_secret: serverEnv.googleClientSecret, redirect_uri: redirectUri, grant_type: "authorization_code" }),
  });
  if (!res.ok) throw new Error(`token exchange failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; refresh_token?: string; expires_in: number; id_token?: string };
  let email: string | null = null;
  if (json.id_token) {
    try {
      email = JSON.parse(Buffer.from(json.id_token.split(".")[1], "base64url").toString()).email ?? null;
    } catch {
      email = null;
    }
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, expiresAt: new Date(Date.now() + (json.expires_in - 60) * 1000).toISOString(), email };
}

async function accessToken(sb: SupabaseClient, c: Connection): Promise<string> {
  if (c.access_token && c.access_expires_at && Date.parse(c.access_expires_at) > Date.now()) return c.access_token;
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: serverEnv.googleClientId, client_secret: serverEnv.googleClientSecret, refresh_token: c.refresh_token, grant_type: "refresh_token" }),
  });
  if (!res.ok) throw new Error(`token refresh failed (${res.status})`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  const expires = new Date(Date.now() + (json.expires_in - 60) * 1000).toISOString();
  await sb.from("google_connections").update({ access_token: json.access_token, access_expires_at: expires }).eq("user_id", c.user_id);
  return json.access_token;
}

async function api<T>(token: string, path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await fetch(`${API}${path}`, { ...init, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", ...(init.headers ?? {}) } });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) throw new Error(`Google ${init.method ?? "GET"} ${path.split("?")[0]} → ${res.status}`);
  return res.status === 204 ? null : ((await res.json()) as T);
}

/** Pull busy time (window: a week back, two months ahead) and push synced blocks. */
export async function syncGoogle(sb: SupabaseClient, userId: string): Promise<{ pulled: number; pushed: number }> {
  const { data: conn } = await sb.from("google_connections").select("*").eq("user_id", userId).maybeSingle();
  if (!conn) return { pulled: 0, pushed: 0 };
  const c = conn as Connection;
  try {
    const token = await accessToken(sb, c);
    const cal = encodeURIComponent(c.calendar_id);
    const from = new Date(Date.now() - SYNC_PAST_DAYS * 86_400_000).toISOString();
    const to = new Date(Date.now() + SYNC_FUTURE_DAYS * 86_400_000).toISOString();

    // 1. pull
    const events: GoogleEvent[] = [];
    let pageToken = "";
    do {
      const q = new URLSearchParams({ timeMin: from, timeMax: to, singleEvents: "true", orderBy: "startTime", maxResults: "2500", ...(pageToken ? { pageToken } : {}) });
      const page = await api<{ items: GoogleEvent[]; nextPageToken?: string }>(token, `/calendars/${cal}/events?${q}`);
      events.push(...(page?.items ?? []));
      pageToken = page?.nextPageToken ?? "";
    } while (pageToken);
    const rows = events.map((e) => mapGoogleEvent(e, c.calendar_id)).filter((r): r is NonNullable<typeof r> => r !== null);
    if (rows.length) {
      const { error } = await sb.from("calendar_events").upsert(rows.map((r) => ({ ...r, user_id: userId, updated_at: new Date().toISOString() })), { onConflict: "user_id,google_id" });
      if (error) throw new Error(error.message);
    }
    // events gone from Google within the window
    const keep = new Set(rows.map((r) => r.google_id));
    const { data: stored } = await sb.from("calendar_events").select("id, google_id").eq("user_id", userId).gte("end_at", from).lte("start_at", to);
    const gone = (stored ?? []).filter((s) => !keep.has(s.google_id)).map((s) => s.id);
    if (gone.length) await sb.from("calendar_events").delete().in("id", gone);

    // 2. push time blocks
    const { data: blocks } = await sb
      .from("time_blocks")
      .select("id, start_at, end_at, title, task_id, sync_google, google_event_id, updated_at, tasks(title)")
      .eq("user_id", userId)
      .gte("end_at", from)
      .or("sync_google.eq.true,google_event_id.not.is.null");
    const list = (blocks ?? []) as unknown as { id: string; start_at: string; end_at: string; title: string | null; sync_google: boolean; google_event_id: string | null; updated_at: string; tasks: { title: string } | null }[];
    const plan = planBlockPush(list, rows.filter((r) => r.time_block_id), c.last_synced_at);
    const { data: prof } = await sb.from("profiles").select("timezone").eq("id", userId).single();
    const tz = (prof?.timezone as string) || "Asia/Tashkent";
    let pushed = 0;
    for (const id of [...plan.create, ...plan.update]) {
      const b = list.find((x) => x.id === id)!;
      const body = JSON.stringify(blockToGoogleEvent(b, b.title || b.tasks?.title || "Reja", tz));
      if (b.google_event_id) {
        const updated = await api(token, `/calendars/${cal}/events/${encodeURIComponent(b.google_event_id)}`, { method: "PATCH", body });
        if (updated) {
          pushed++;
          continue;
        }
      }
      const created = await api<{ id: string }>(token, `/calendars/${cal}/events`, { method: "POST", body });
      if (created) {
        await sb.from("time_blocks").update({ google_event_id: created.id }).eq("id", b.id);
        pushed++;
      }
    }
    for (const eventId of plan.remove) {
      await api(token, `/calendars/${cal}/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
      pushed++;
    }
    if (plan.clear.length) await sb.from("time_blocks").update({ google_event_id: null }).in("id", plan.clear);
    if (plan.remove.length) await sb.from("calendar_events").delete().eq("user_id", userId).in("google_id", plan.remove);

    await sb.from("google_connections").update({ last_synced_at: new Date().toISOString(), last_error: null }).eq("user_id", userId);
    return { pulled: rows.length, pushed };
  } catch (e) {
    await sb.from("google_connections").update({ last_error: (e as Error).message.slice(0, 300) }).eq("user_id", userId);
    throw e;
  }
}

export async function disconnectGoogle(sb: SupabaseClient, userId: string) {
  const { data } = await sb.from("google_connections").select("refresh_token").eq("user_id", userId).maybeSingle();
  if (data?.refresh_token) {
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(data.refresh_token as string)}`, { method: "POST" }).catch(() => {});
  }
  await sb.from("calendar_events").delete().eq("user_id", userId);
  await sb.from("time_blocks").update({ sync_google: false, google_event_id: null }).eq("user_id", userId).not("google_event_id", "is", null);
  await sb.from("google_connections").delete().eq("user_id", userId);
}
