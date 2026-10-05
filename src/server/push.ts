import "server-only";
import webpush from "web-push";
import { VAPID_PUBLIC_KEY } from "@/lib/env";
import { serverEnv } from "./env";

let configured = false;

export function pushConfigured() {
  return Boolean(VAPID_PUBLIC_KEY && serverEnv.vapidPrivateKey);
}

export interface PushTarget {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** Send a Web Push message. Returns "gone" when the subscription has expired and should be deleted. */
export async function sendPush(sub: PushTarget, payload: { title: string; body?: string; url?: string; tag?: string }): Promise<"ok" | "gone" | "error"> {
  if (!pushConfigured()) return "error";
  if (!configured) {
    webpush.setVapidDetails(serverEnv.vapidSubject, VAPID_PUBLIC_KEY, serverEnv.vapidPrivateKey);
    configured = true;
  }
  try {
    await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), { TTL: 3600, urgency: "high" });
    return "ok";
  } catch (e) {
    const status = (e as { statusCode?: number }).statusCode;
    return status === 404 || status === 410 ? "gone" : "error";
  }
}
