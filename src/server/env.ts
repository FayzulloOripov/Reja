import "server-only";
import { z } from "zod";

const schema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
  SUPABASE_SECRET_KEY: z.string().optional(),
  CRON_SECRET: z.string().min(16).optional(),
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_WEBHOOK_SECRET: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  ALLOW_DEMO_SEED: z.string().optional(),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

const parsed = schema.parse(process.env);

export const serverEnv = {
  serviceKey: parsed.SUPABASE_SECRET_KEY ?? parsed.SUPABASE_SERVICE_ROLE_KEY ?? "",
  cronSecret: parsed.CRON_SECRET ?? "",
  telegramToken: parsed.TELEGRAM_BOT_TOKEN ?? "",
  telegramWebhookSecret: parsed.TELEGRAM_WEBHOOK_SECRET ?? "",
  vapidPrivateKey: parsed.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: parsed.VAPID_SUBJECT ?? "mailto:admin@example.com",
  resendKey: parsed.RESEND_API_KEY ?? "",
  emailFrom: parsed.EMAIL_FROM ?? "Reja <onboarding@resend.dev>",
  allowDemoSeed: parsed.ALLOW_DEMO_SEED === "true",
  googleClientId: (parsed.GOOGLE_CLIENT_ID ?? "").trim(),
  googleClientSecret: (parsed.GOOGLE_CLIENT_SECRET ?? "").trim(),
};

export const googleConfigured = () => Boolean(serverEnv.googleClientId && serverEnv.googleClientSecret);
