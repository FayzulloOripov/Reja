"use client";

import { Copy, Globe, Link2, Loader2, Mail, Trash2, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/common/bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEMO_MODE } from "@/lib/env";
import type { Project, ProjectRole } from "@/lib/types";
import { updateProject } from "@/store/actions";
import { uuid } from "@/store/factories";
import { useProfiles, useUserId } from "@/store/hooks";
import { mutate, useStore } from "@/store/store";
import { createInvitation } from "@/server/actions/invitations";

export function ShareDialog({ project, open, onOpenChange, manager }: { project: Project; open: boolean; onOpenChange: (o: boolean) => void; manager: boolean }) {
  const t = useTranslations();
  const uid = useUserId();
  const profiles = useProfiles();
  const pms = useStore((s) => s.data.project_members);
  const wsMembers = useStore((s) => s.data.workspace_members);
  const invitations = useStore((s) => s.data.invitations);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ProjectRole>("member");
  const [days, setDays] = useState<1 | 7 | 30>(7);
  const [busy, setBusy] = useState(false);
  const [lastLink, setLastLink] = useState<string | null>(null);

  const members = useMemo(() => Object.values(pms).filter((m) => m.project_id === project.id), [pms, project.id]);
  const fullMembers = useMemo(
    () =>
      project.visibility === "workspace"
        ? Object.values(wsMembers).filter((m) => m.workspace_id === project.workspace_id && m.role !== "guest" && !members.some((pm) => pm.user_id === m.user_id))
        : [],
    [wsMembers, project, members],
  );
  const pending = useMemo(
    () => Object.values(invitations).filter((i) => i.project_id === project.id && !i.revoked_at && new Date(i.expires_at) > new Date() && (i.email ? !i.accepted_at : true)),
    [invitations, project.id],
  );

  const shareUrl = project.share_token && typeof window !== "undefined" ? `${window.location.origin}/share/${project.share_token}` : null;

  async function invite(withEmail: boolean) {
    setBusy(true);
    try {
      if (DEMO_MODE) {
        const token = uuid().replace(/-/g, "");
        setLastLink(`${window.location.origin}/invite/${token}`);
        toast.success(withEmail ? t("settings.inviteSent") : t("settings.inviteLinkCreated"));
        return;
      }
      const res = await createInvitation({
        workspaceId: project.workspace_id,
        projectId: project.id,
        email: withEmail ? email.trim() : null,
        role,
        expiresDays: days,
      });
      if (!res.ok) {
        toast.error(res.error === "rate_limited" ? t("auth.rateLimited") : t("errors.saveFailed", { message: res.error }));
        return;
      }
      setLastLink(res.url);
      if (withEmail) {
        setEmail("");
        toast.success(res.emailed ? t("settings.inviteSent") : t("settings.inviteLinkCreated"));
      } else {
        await navigator.clipboard.writeText(res.url).catch(() => {});
        toast.success(t("settings.inviteLinkCreated"));
      }
      // pick up the new invitation row
      void useStore.getState().adapter?.loadAll(uid).then((d) => d.invitations && useStore.setState((s) => ({ data: { ...s.data, invitations: d.invitations! } })));
    } finally {
      setBusy(false);
    }
  }

  const copy = (text: string) => {
    void navigator.clipboard.writeText(text);
    toast.success(t("common.copied"));
  };

  const roleLabel = (r: ProjectRole) => t(`settings.roles.${r}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("project.share")} · {project.name}</DialogTitle>
          <DialogDescription className="sr-only">{t("share.hint")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="people">
          <TabsList className="w-full">
            <TabsTrigger value="people" className="flex-1">{t("share.inviteTitle")}</TabsTrigger>
            <TabsTrigger value="public" className="flex-1">{t("share.title")}</TabsTrigger>
          </TabsList>

          <TabsContent value="people" className="space-y-5 pt-3">
            {manager && (
              <div className="space-y-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (email.trim()) void invite(true);
                  }}
                  className="flex flex-col gap-2 sm:flex-row"
                >
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t("auth.emailPlaceholder")} aria-label={t("common.email")} className="flex-1" />
                  <Select value={role} onValueChange={(v) => setRole(v as ProjectRole)}>
                    <SelectTrigger className="sm:w-36" aria-label={t("settings.inviteRole")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["manager", "member", "viewer"] as const).map((r) => (
                        <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button type="submit" disabled={busy || !email.trim()}>
                    {busy ? <Loader2 className="animate-spin" /> : <Mail />} {t("settings.inviteSend")}
                  </Button>
                </form>
                <p className="text-xs text-muted-foreground">
                  {t(`settings.roleHints.${role === "member" ? "projectMember" : role}`)}
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <Select value={String(days)} onValueChange={(v) => setDays(Number(v) as 1 | 7 | 30)}>
                    <SelectTrigger className="h-8 w-32" aria-label={t("settings.inviteExpires")}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">{t("settings.days1")}</SelectItem>
                      <SelectItem value="7">{t("settings.days7")}</SelectItem>
                      <SelectItem value="30">{t("settings.days30")}</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => invite(false)} disabled={busy}>
                    <Link2 /> {t("settings.inviteCreateLink")}
                  </Button>
                </div>
                {lastLink && (
                  <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
                    <code className="flex-1 truncate text-xs">{lastLink}</code>
                    <Button size="icon-sm" variant="ghost" onClick={() => copy(lastLink)} aria-label={t("common.copy")}>
                      <Copy />
                    </Button>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1">
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("share.projectMembers")}</p>
              <ul className="divide-y">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 py-2">
                    <UserAvatar profile={profiles[m.user_id]} size={28} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{profiles[m.user_id]?.name ?? "…"}</p>
                      <p className="truncate text-xs text-muted-foreground">{profiles[m.user_id]?.email}</p>
                    </div>
                    {manager ? (
                      <>
                        <Select
                          value={m.role}
                          onValueChange={(v) => mutate([{ table: "project_members", kind: "update", row: { project_id: m.project_id, user_id: m.user_id }, values: { role: v as ProjectRole } }])}
                        >
                          <SelectTrigger aria-label={t("common.role")} className="h-8 w-32"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(["manager", "member", "viewer"] as const).map((r) => (
                              <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("settings.removeMember")}
                          onClick={() => mutate([{ table: "project_members", kind: "delete", row: { project_id: m.project_id, user_id: m.user_id } }])}
                        >
                          <X />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-muted-foreground">{roleLabel(m.role)}</span>
                    )}
                  </li>
                ))}
                {fullMembers.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 py-2">
                    <UserAvatar profile={profiles[m.user_id]} size={28} />
                    <p className="min-w-0 flex-1 truncate text-sm">{profiles[m.user_id]?.name ?? "…"}</p>
                    <span className="text-xs text-muted-foreground">{t(`settings.roles.${m.role}`)}</span>
                  </li>
                ))}
              </ul>
            </div>

            {pending.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">{t("settings.pendingInvites")}</p>
                <ul className="divide-y">
                  {pending.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2 text-sm">
                      {i.email ? <Mail className="size-4 text-muted-foreground" /> : <Link2 className="size-4 text-muted-foreground" />}
                      <span className="min-w-0 flex-1 truncate">{i.email ?? t("common.link")}</span>
                      <span className="text-xs text-muted-foreground">{roleLabel(i.role as ProjectRole)}</span>
                      {manager && (
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-label={t("settings.inviteRevoke")}
                          onClick={() => mutate([{ table: "invitations", kind: "update", row: { id: i.id }, values: { revoked_at: new Date().toISOString() } }])}
                        >
                          <Trash2 />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </TabsContent>

          <TabsContent value="public" className="space-y-3 pt-3">
            <div className="flex items-start gap-3 rounded-xl border p-3">
              <Globe className="mt-0.5 size-5 text-info" />
              <div className="flex-1 space-y-1">
                <p className="text-sm font-medium">{t("share.enable")}</p>
                <p className="text-xs text-muted-foreground">{t("share.hint")}</p>
              </div>
              <Switch
                checked={Boolean(project.share_token)}
                disabled={!manager}
                onCheckedChange={(on) => updateProject(project.id, { share_token: on ? uuid().replace(/-/g, "") + uuid().replace(/-/g, "").slice(0, 8) : null })}
                aria-label={t("share.enable")}
              />
            </div>
            {shareUrl && (
              <div className="flex items-center gap-2 rounded-lg bg-muted p-2">
                <code className="flex-1 truncate text-xs">{shareUrl}</code>
                <Button size="icon-sm" variant="ghost" onClick={() => copy(shareUrl)} aria-label={t("common.copy")}>
                  <Copy />
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
