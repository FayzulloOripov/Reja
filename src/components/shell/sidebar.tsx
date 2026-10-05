"use client";

import {
  BarChart3,
  Bell,
  CalendarRange,
  ChevronDown,
  Check,
  Inbox,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sprout,
  Star,
  Sun,
  SunMedium,
  Target,
  Timer,
  Users,
  Keyboard,
  Languages,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "@/components/providers/theme";
import { useMemo, type ComponentType, type ReactNode } from "react";
import { Kbd, ProjectDot, UserAvatar } from "@/components/common/bits";
import { LogoMark } from "@/components/brand/logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tip, Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { APP_NAME } from "@/lib/env";
import { useIsDemo } from "@/hooks/use-demo";
import { isOpen } from "@/lib/health";
import { cn } from "@/lib/utils";
import { switchWorkspace, updateProfile } from "@/store/actions";
import {
  useCurrentWorkspace,
  useFavorites,
  useMe,
  useMyTasks,
  useProjects,
  useToday,
  useUnreadCount,
  useWorkspaceRole,
  useWorkspaces,
  tasksByProject,
} from "@/store/hooks";
import { useStore } from "@/store/store";
import { useUI } from "@/store/ui";
import { setLocaleCookie } from "@/server/actions/locale";
import { isFullMember } from "@/lib/permissions";

interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  badge?: number;
  tone?: "danger";
}

export function useNavItems() {
  const t = useTranslations("nav");
  const unread = useUnreadCount();
  const mine = useMyTasks();
  const today = useToday();
  const inboxCount = useMemo(() => mine.filter((x) => !x.project_id && isOpen(x)).length, [mine]);
  const todayCount = useMemo(
    () => mine.filter((x) => isOpen(x) && ((x.due_date && x.due_date <= today) || x.top_date === today)).length,
    [mine, today],
  );
  const primary: NavItem[] = [
    { href: "/", label: t("home"), icon: SunMedium, badge: todayCount },
    { href: "/inbox", label: t("inbox"), icon: Inbox, badge: inboxCount },
    { href: "/upcoming", label: t("upcoming"), icon: CalendarRange },
    { href: "/overview", label: t("overview"), icon: LayoutDashboard },
    { href: "/notifications", label: t("notifications"), icon: Bell, badge: unread, tone: "danger" },
  ];
  const secondary: NavItem[] = [
    { href: "/goals", label: t("goals"), icon: Target },
    { href: "/habits", label: t("habits"), icon: Sprout },
    { href: "/focus", label: t("focus"), icon: Timer },
    { href: "/reports", label: t("reports"), icon: BarChart3 },
    { href: "/workload", label: t("workload"), icon: Users },
  ];
  return { primary, secondary };
}

function NavLink({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const Icon = item.icon;
  const link = (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-13 font-medium text-sidebar-foreground transition-colors",
        "hover:bg-sidebar-accent focus-visible:bg-sidebar-accent",
        active && "bg-card text-foreground shadow-elev-1",
        collapsed && "justify-center px-0",
      )}
    >
      <Icon className={cn("size-4 shrink-0", active ? "text-brand" : "text-muted-foreground group-hover:text-foreground")} />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && !!item.badge && (
        <span
          className={cn(
            "tnum rounded-full px-1.5 text-2xs font-semibold",
            item.tone === "danger" ? "bg-destructive text-white" : "text-muted-foreground",
          )}
        >
          {item.badge}
        </span>
      )}
      {collapsed && !!item.badge && item.tone === "danger" && <span className="absolute ml-5 -mt-4 size-2 rounded-full bg-destructive" />}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const t = useTranslations();
  const workspaces = useWorkspaces();
  const current = useCurrentWorkspace();
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex h-10 w-full items-center gap-2.5 rounded-xl px-2 text-left transition-colors hover:bg-sidebar-accent",
            collapsed && "justify-center px-0",
          )}
          aria-label={t("nav.switchWorkspace")}
        >
          <LogoMark className="size-7" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-13 leading-tight font-semibold">{current?.name ?? APP_NAME}</span>
                <span className="block text-2xs leading-tight text-muted-foreground">{APP_NAME}</span>
              </span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>{t("settings.workspacesTitle")}</DropdownMenuLabel>
        {workspaces.map((w) => (
          <DropdownMenuItem key={w.id} onSelect={() => switchWorkspace(w.id)}>
            <ProjectDot color={w.color} />
            <span className="flex-1 truncate">{w.name}</span>
            {w.id === current?.id && <Check className="size-4 text-brand" />}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push("/settings/workspace?new=1")}>
          <Plus /> {t("nav.newWorkspace")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function UserMenu({ collapsed }: { collapsed?: boolean }) {
  const t = useTranslations("nav");
  const me = useMe();
  const { theme, setTheme } = useTheme();
  const locale = useLocale();
  const router = useRouter();
  const setShortcuts = useUI((s) => s.setShortcuts);
  const demo = useIsDemo();

  async function changeLanguage(l: "uz" | "en") {
    updateProfile({ language: l });
    await setLocaleCookie(l);
    router.refresh();
  }
  function changeTheme(v: "light" | "dark" | "system") {
    setTheme(v);
    updateProfile({ theme: v });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={collapsed ? "icon" : "default"}
          aria-label={t("accountMenu", { name: me?.name || me?.email || "" })}
          className={cn("min-w-0 text-muted-foreground", !collapsed && "h-9 flex-1 justify-start gap-2.5 px-2")}
        >
          <UserAvatar profile={me} size={22} />
          {!collapsed && <span className="truncate text-13 text-foreground">{me?.name || me?.email}</span>}
          {!collapsed && <ChevronDown className="ml-auto size-3.5" aria-hidden />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuLabel className="truncate">{me?.email}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <Settings /> {t("settings")}
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun /> {t("theme")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {(
              [
                ["light", Sun, t("themeLight")],
                ["dark", Moon, t("themeDark")],
                ["system", Monitor, t("themeSystem")],
              ] as const
            ).map(([v, Icon, label]) => (
              <DropdownMenuItem key={v} onSelect={() => changeTheme(v)}>
                <Icon /> {label} {theme === v && <Check className="ml-auto size-4" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Languages /> {t("language")}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onSelect={() => changeLanguage("uz")}>
              Oʻzbekcha {locale === "uz" && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => changeLanguage("en")}>
              English {locale === "en" && <Check className="ml-auto size-4" />}
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={() => setShortcuts(true)} className="hidden md:flex">
          <Keyboard /> {t("shortcuts")} <Kbd className="ml-auto">?</Kbd>
        </DropdownMenuItem>
        {demo ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <a href="/demo/exit">
                <LogOut /> {t("leaveDemo")}
              </a>
            </DropdownMenuItem>
          </>
        ) : (
          <>
            <DropdownMenuSeparator />
            <form action="/auth/signout" method="post">
              <DropdownMenuItem asChild variant="destructive">
                <button type="submit" className="w-full" onClick={() => useStore.getState().userId && localStorage.removeItem("reja:ui")}>
                  <LogOut /> {t("signOut")}
                </button>
              </DropdownMenuItem>
            </form>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Sidebar() {
  const t = useTranslations("nav");
  const pathname = usePathname();
  const collapsed = useUI((s) => s.sidebarCollapsed);
  const toggle = useUI((s) => s.toggleSidebar);
  const setPalette = useUI((s) => s.setPalette);
  const openQuickAdd = useUI((s) => s.openQuickAdd);
  const setNewProject = useUI((s) => s.setNewProject);
  const { primary, secondary } = useNavItems();
  const ws = useCurrentWorkspace();
  const role = useWorkspaceRole(ws?.id);
  const projects = useProjects(ws?.id);
  const favorites = useFavorites();
  const tasks = useStore((s) => s.data.tasks);
  const today = useToday();
  const counts = useMemo(() => {
    const by = tasksByProject(tasks);
    const out: Record<string, { open: number; overdue: number }> = {};
    for (const p of projects) {
      const list = (by[p.id] ?? []).filter((x) => !x.parent_id && isOpen(x));
      out[p.id] = { open: list.length, overdue: list.filter((x) => x.due_date && x.due_date < today).length };
    }
    return out;
  }, [tasks, projects, today]);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out md:flex",
        collapsed ? "w-[60px]" : "w-[252px]",
      )}
      aria-label={t("mainNav")}
    >
      <div className={cn("flex items-center gap-1 p-2.5 pb-1", collapsed && "flex-col")}>
        <WorkspaceSwitcher collapsed={collapsed} />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button tooltip={false} variant="ghost" size="icon-sm" onClick={toggle} aria-label={collapsed ? t("expand") : t("collapse")} className="shrink-0 text-muted-foreground">
              <PanelLeftClose className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">{collapsed ? t("expand") : t("collapse")}</TooltipContent>
        </Tooltip>
      </div>

      <div className={cn("flex gap-1.5 px-2.5 py-2", collapsed && "flex-col items-center")}>
        <Button
          onClick={() => openQuickAdd()}
          className={cn("h-8 flex-1 justify-start gap-2 shadow-elev-1", collapsed && "size-8 flex-none justify-center p-0")}
          aria-label={t("newTask")}
        >
          <Plus className="size-4" />
          {!collapsed && (
            <>
              <span className="flex-1 text-left">{t("newTask")}</span>
              <Kbd className="border-white/20 bg-white/15 text-white/90">Q</Kbd>
            </>
          )}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button tooltip={false} variant="outline" size="icon" onClick={() => setPalette(true)} aria-label={t("search")} className="size-8 bg-card">
              <Search className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="right">
            {t("search")} <Kbd className="ml-1">⌘K</Kbd>
          </TooltipContent>
        </Tooltip>
      </div>

      <nav className="scrollbar-none flex-1 space-y-5 overflow-y-auto px-2.5 pt-1 pb-4">
        <ul className="space-y-0.5">
          {primary.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item.href)} collapsed={collapsed} />
            </li>
          ))}
        </ul>

        {favorites.length > 0 && (
          <div className="space-y-1">
            {!collapsed && <p className="flex items-center gap-1.5 px-2.5 text-2xs font-semibold tracking-wide text-muted-foreground uppercase"><Star className="size-3" /> {t("favorites")}</p>}
            <ul className="space-y-0.5">
              {favorites.map((p) => (
                <li key={p.id}>
                  <ProjectLink project={p} active={pathname.startsWith(`/projects/${p.id}`)} collapsed={collapsed} count={counts[p.id]} />
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="space-y-1">
          {!collapsed && (
            <div className="flex items-center justify-between px-2.5">
              <p className="text-2xs font-semibold tracking-wide text-muted-foreground uppercase">{t("projects")}</p>
              {isFullMember(role) && (
                <Button variant="ghost" size="icon-xs" onClick={() => setNewProject(true)} aria-label={t("newProject")} className="text-muted-foreground">
                  <Plus />
                </Button>
              )}
            </div>
          )}
          <ul className="space-y-0.5">
            {projects.map((p) => (
              <li key={p.id}>
                <ProjectLink project={p} active={pathname.startsWith(`/projects/${p.id}`)} collapsed={collapsed} count={counts[p.id]} />
              </li>
            ))}
          </ul>
        </div>

        <ul className="space-y-0.5">
          {secondary.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item.href)} collapsed={collapsed} />
            </li>
          ))}
        </ul>
      </nav>

      <div className={cn("flex items-center gap-1 border-t border-sidebar-border p-2.5", collapsed && "flex-col")}>
        <UserMenu collapsed={collapsed} />
        <Tip label={t("settings")} side={collapsed ? "right" : "top"}>
          <Button asChild variant="ghost" size="icon" className={cn("shrink-0 text-muted-foreground", isActive("/settings") && "bg-card text-foreground shadow-elev-1")}>
            <Link href="/settings" aria-label={t("settings")} aria-current={isActive("/settings") ? "page" : undefined}>
              <Settings className="size-4" />
            </Link>
          </Button>
        </Tip>
      </div>
    </aside>
  );
}

function ProjectLink({
  project,
  active,
  collapsed,
  count,
}: {
  project: { id: string; name: string; color: string; visibility: string };
  active: boolean;
  collapsed: boolean;
  count?: { open: number; overdue: number };
}): ReactNode {
  const link = (
    <Link
      href={`/projects/${project.id}`}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group flex h-8 items-center gap-2.5 rounded-lg px-2.5 text-13 text-sidebar-foreground transition-colors hover:bg-sidebar-accent",
        active && "bg-card font-medium text-foreground shadow-elev-1",
        collapsed && "justify-center px-0",
      )}
    >
      <ProjectDot color={project.color} className={cn(active && "ring-4 ring-[color-mix(in_oklch,var(--pc)_22%,transparent)]")} />
      {!collapsed && <span className="flex-1 truncate">{project.name}</span>}
      {!collapsed && count && count.open > 0 && (
        <span className={cn("tnum text-2xs", count.overdue ? "font-semibold text-danger-fg" : "text-muted-foreground")}>{count.open}</span>
      )}
    </Link>
  );
  if (!collapsed) return link;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right">{project.name}</TooltipContent>
    </Tooltip>
  );
}
