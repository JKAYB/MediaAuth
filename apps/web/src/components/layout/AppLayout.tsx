import { Link, Outlet, useLocation, useNavigate, useRouterState } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  LayoutDashboard,
  ScanSearch,
  History,
  Settings,
  Bell,
  Search,
  Menu,
  X,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/brand/Logo";
import { clearToken } from "@/lib/auth-storage";
import { getMe } from "@/lib/api";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/scan", label: "New scan", icon: ScanSearch },
  { to: "/scans", label: "History", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function initialsFromEmail(email: string) {
  const local = email.split("@")[0] || "?";
  const parts = local.split(/[._-]/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return local.slice(0, 2).toUpperCase() || "?";
}

function SidebarContent({
  pathname,
  onMobileNavClick,
  onLogout,
  profile,
}: {
  pathname: string;
  onMobileNavClick?: () => void;
  onLogout: () => void;
  profile: { name: string; email: string; initials: string } | null;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 py-5">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        <div className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Workspace
        </div>
        {nav.map((item) => {
          const active =
            pathname === item.to || (item.to !== "/dashboard" && pathname.startsWith(item.to));
          const Icon = item.icon;
          return (
            <Link
              key={item.to}
              to={item.to}
              onClick={onMobileNavClick}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all",
                active
                  ? "text-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-lg bg-gradient-to-r from-primary/15 to-accent/10 ring-1 ring-inset ring-primary/30"
                  transition={{ type: "spring", stiffness: 400, damping: 32 }}
                />
              )}
              <Icon className="relative h-4 w-4 shrink-0" />
              <span className="relative">{item.label}</span>
              {active && (
                <span className="relative ml-auto h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_10px_var(--primary)]" />
              )}
            </Link>
          );
        })}
      </nav>

      <div className="m-3 rounded-xl border border-border/60 bg-gradient-to-br from-primary/10 via-accent/10 to-transparent p-4">
        <div className="mb-2 flex items-center gap-2 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          Upgrade to Enterprise
        </div>
        <p className="text-xs text-muted-foreground">
          Unlimited scans, team workspaces, and audit-grade reports.
        </p>
        <button className="mt-3 w-full rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition hover:opacity-90">
          See plans
        </button>
      </div>

      <div className="border-t border-border/60 p-3">
        <div className="flex items-center gap-3 rounded-lg p-2 hover:bg-sidebar-accent">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-sm font-semibold text-primary-foreground">
            {profile?.initials ?? "—"}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium">{profile?.name ?? "…"}</div>
            <div className="truncate text-xs text-muted-foreground">{profile?.email ?? ""}</div>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-background hover:text-foreground"
            aria-label="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<{ name: string; email: string; initials: string } | null>(
    null,
  );
  const isLoading = useRouterState({ select: (s) => s.isLoading });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await getMe();
        if (!cancelled) {
          setProfile({
            email: me.email,
            name: me.email.split("@")[0] || "User",
            initials: initialsFromEmail(me.email),
          });
        }
      } catch {
        if (!cancelled) setProfile(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onLogout = () => {
    clearToken();
    navigate({ to: "/login" });
  };

  return (
    <div className="relative min-h-screen">
      {/* Top progress bar */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, scaleX: 0 }}
            animate={{ opacity: 1, scaleX: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-x-0 top-0 z-50 h-0.5 origin-left bg-gradient-to-r from-primary via-accent to-primary"
          />
        )}
      </AnimatePresence>

      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-sidebar-border bg-sidebar/70 backdrop-blur-xl lg:block">
        <SidebarContent pathname={location.pathname} profile={profile} onLogout={onLogout} />
      </aside>

      {/* Mobile sidebar */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm lg:hidden"
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-sidebar-border bg-sidebar lg:hidden"
            >
              <SidebarContent
                pathname={location.pathname}
                profile={profile}
                onMobileNavClick={() => setMobileOpen(false)}
                onLogout={() => {
                  setMobileOpen(false);
                  onLogout();
                }}
              />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-64">
        {/* Topbar */}
        <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <button
              className="rounded-md p-2 hover:bg-muted lg:hidden"
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="relative hidden flex-1 max-w-md md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Search scans, reports, media…"
                className="h-9 w-full rounded-lg border border-border bg-input/60 pl-9 pr-16 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40"
              />
              <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border border-border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
                ⌘K
              </kbd>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button className="relative rounded-lg p-2 text-muted-foreground transition hover:bg-muted hover:text-foreground">
                <Bell className="h-4 w-4" />
                <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary shadow-[0_0_8px_var(--primary)]" />
              </button>
              <Link
                to="/scan"
                className="hidden items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] transition hover:scale-[1.02] active:scale-[0.98] sm:inline-flex"
              >
                <ScanSearch className="h-3.5 w-3.5" />
                New scan
              </Link>
            </div>
          </div>
        </header>

        {/* Page content with route transitions */}
        <main className="relative px-4 py-6 sm:px-6 lg:px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile menu close */}
      {mobileOpen && (
        <button
          className="fixed right-4 top-3 z-[60] rounded-md bg-card p-2 text-foreground shadow lg:hidden"
          onClick={() => setMobileOpen(false)}
          aria-label="Close menu"
        >
          <X className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
