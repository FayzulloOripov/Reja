"use server";

import { z } from "zod";
import { InviteEmail } from "@/emails/invite";
import { siteUrl } from "@/lib/env";
import { getServerSupabase } from "@/lib/supabase/server";
import { sendEmail } from "../email";
import { serverT } from "../i18n";
import { rateLimit } from "../rate-limit";

const createSchema = z
  .object({
    workspaceId: z.uuid(),
    projectId: z.uuid().nullable(),
    email: z.email().max(254).nullable(),
    role: z.enum(["admin", "member", "guest", "manager", "viewer"]),
    expiresDays: z.union([z.literal(1), z.literal(7), z.literal(30)]),
    maxUses: z.number().int().min(1).max(1000).nullable().optional(),
  })
  .refine((v) => (v.projectId ? ["manager", "member", "viewer"].includes(v.role) : ["admin", "member", "guest"].includes(v.role)), {
    message: "role does not match scope",
  });

export type InvitationResult = { ok: true; url: string; emailed: boolean } | { ok: false; error: string };

export async function createInvitation(input: z.input<typeof createSchema>): Promise<InvitationResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const v = parsed.data;
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "unauthorized" };
  if (!(await rateLimit(`invite:${user.id}`, 30, 3600))) return { ok: false, error: "rate_limited" };

  const expires = new Date(Date.now() + v.expiresDays * 86_400_000).toISOString();
  const { data, error } = await supabase
    .from("invitations")
    .insert({
      workspace_id: v.workspaceId,
      project_id: v.projectId,
      email: v.email?.toLowerCase() ?? null,
      role: v.role,
      created_by: user.id,
      expires_at: expires,
      max_uses: v.email ? 1 : (v.maxUses ?? null),
    })
    .select("token")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "failed" };

  const url = `${siteUrl()}/invite/${data.token}`;
  let emailed = false;
  if (v.email) {
    const [{ data: profile }, { data: ws }, project] = await Promise.all([
      supabase.from("profiles").select("name, language").eq("id", user.id).single(),
      supabase.from("workspaces").select("name").eq("id", v.workspaceId).single(),
      v.projectId ? supabase.from("projects").select("name").eq("id", v.projectId).single() : Promise.resolve({ data: null }),
    ]);
    const lang = profile?.language ?? "uz";
    const t = serverT(lang);
    const name = (project.data as { name: string } | null)?.name ?? ws?.name ?? "Reja";
    const inviter = profile?.name || user.email || "Reja";
    const role = t(`settings.roles.${v.role}` as never);
    try {
      emailed = await sendEmail({
        to: v.email,
        subject: t("email.inviteSubject", { inviter, name }),
        react: InviteEmail({
          heading: t("email.inviteHeading"),
          body: t("email.inviteBody", { inviter, name, role }),
          button: t("email.inviteButton"),
          expires: t("email.inviteExpires", { date: expires.slice(0, 10) }),
          footer: t("email.footer"),
          url,
          lang,
        }),
      });
    } catch {
      emailed = false; // the link still works; the UI offers to copy it
    }
  }
  return { ok: true, url, emailed };
}

const tokenSchema = z.string().min(20).max(80).regex(/^[a-zA-Z0-9]+$/);

export async function acceptInvitation(token: string): Promise<{ ok: true; workspaceId: string; projectId: string | null } | { ok: false; error: string }> {
  const parsed = tokenSchema.safeParse(token);
  if (!parsed.success) return { ok: false, error: "invalid" };
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: parsed.data });
  if (error) {
    const code = /wrong_email/.test(error.message) ? "wrong_email" : /expired|not_found/.test(error.message) ? "expired" : error.message;
    return { ok: false, error: code };
  }
  const res = data as { workspace_id: string; project_id: string | null };
  // jump straight into the shared workspace
  await supabase.from("profiles").update({ current_workspace_id: res.workspace_id }).eq("id", (await supabase.auth.getUser()).data.user!.id);
  return { ok: true, workspaceId: res.workspace_id, projectId: res.project_id };
}
