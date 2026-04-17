import { createFileRoute } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { useState } from "react";
import { Camera, Key, Bell, Trash2, LogOut, Check } from "lucide-react";
import { user } from "@/lib/mock-data";
import { SectionHeader } from "@/components/ui-ext/SectionHeader";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Settings — MediaAuth" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const [tab, setTab] = useState<"profile" | "security" | "notifications">("profile");
  const tabs = [
    { id: "profile", label: "Profile", icon: Camera },
    { id: "security", label: "Security", icon: Key },
    { id: "notifications", label: "Notifications", icon: Bell },
  ] as const;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <SectionHeader
        eyebrow="Account"
        title="Settings"
        description="Manage your profile, security, and notification preferences."
      />

      <div className="grid gap-6 lg:grid-cols-[200px,1fr]">
        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border/60 bg-card/60 p-1.5 backdrop-blur-xl lg:flex-col">
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "relative inline-flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition",
                  active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="settings-active"
                    className="absolute inset-0 rounded-lg bg-gradient-to-br from-primary/15 to-accent/10 ring-1 ring-inset ring-primary/30"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <t.icon className="relative h-4 w-4" />
                <span className="relative">{t.label}</span>
              </button>
            );
          })}
        </nav>

        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-6"
        >
          {tab === "profile" && (
            <>
              <Card title="Profile">
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-primary to-accent text-xl font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)]">
                    {user.initials}
                  </div>
                  <div>
                    <button className="rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium hover:bg-muted">
                      Upload photo
                    </button>
                    <p className="mt-1 text-xs text-muted-foreground">PNG or JPG, up to 4 MB.</p>
                  </div>
                </div>
                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Input label="Full name" defaultValue={user.name} />
                  <Input label="Email" defaultValue={user.email} type="email" />
                  <Input label="Organization" defaultValue={user.org} />
                  <Input label="Plan" defaultValue={user.plan} disabled />
                </div>
                <SaveBar />
              </Card>
            </>
          )}

          {tab === "security" && (
            <>
              <Card title="Password">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Input label="Current password" type="password" />
                  <span className="hidden sm:block" />
                  <Input label="New password" type="password" />
                  <Input label="Confirm new password" type="password" />
                </div>
                <SaveBar label="Update password" />
              </Card>
              <Card title="Sessions">
                <div className="space-y-2">
                  {[
                    {
                      device: "MacBook Pro · Chrome",
                      loc: "San Francisco · current",
                      current: true,
                    },
                    { device: "iPhone 15 · Safari", loc: "San Francisco · 2h ago" },
                  ].map((s) => (
                    <div
                      key={s.device}
                      className="flex items-center justify-between rounded-lg border border-border bg-input/30 px-4 py-3"
                    >
                      <div>
                        <div className="text-sm font-medium">{s.device}</div>
                        <div className="text-xs text-muted-foreground">{s.loc}</div>
                      </div>
                      {s.current ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs text-success ring-1 ring-success/30">
                          <Check className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <button className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground">
                          <LogOut className="h-3 w-3" /> Sign out
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
              <Card title="Danger zone" tone="destructive">
                <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="text-sm font-medium">Delete account</div>
                    <div className="text-xs text-muted-foreground">
                      Permanently remove your account and all scan history. This cannot be undone.
                    </div>
                  </div>
                  <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-destructive/15 px-3 text-sm font-medium text-destructive ring-1 ring-destructive/30 hover:bg-destructive/25">
                    <Trash2 className="h-4 w-4" /> Delete account
                  </button>
                </div>
              </Card>
            </>
          )}

          {tab === "notifications" && (
            <Card title="Notifications">
              <div className="space-y-1">
                {[
                  { l: "Scan complete", d: "Email me when a scan finishes.", on: true },
                  { l: "Manipulation detected", d: "Notify me of flagged media.", on: true },
                  { l: "Weekly digest", d: "Summary of activity every Monday.", on: false },
                  { l: "Product updates", d: "New features and changelog.", on: false },
                ].map((row) => (
                  <ToggleRow key={row.l} label={row.l} desc={row.d} defaultOn={row.on} />
                ))}
              </div>
            </Card>
          )}
        </motion.div>
      </div>
    </div>
  );
}

function Card({
  title,
  children,
  tone = "default",
}: {
  title: string;
  children: React.ReactNode;
  tone?: "default" | "destructive";
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-card/60 p-6 backdrop-blur-xl elevated",
        tone === "destructive" ? "border-destructive/30" : "border-border/60",
      )}
    >
      <h3 className="mb-5 font-display text-base font-semibold">{title}</h3>
      {children}
    </div>
  );
}

function Input({
  label,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-muted-foreground">{label}</span>
      <input
        {...props}
        className={cn(
          "h-10 w-full rounded-lg border border-border bg-input/60 px-3 text-sm placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60",
          props.className,
        )}
      />
    </label>
  );
}

function SaveBar({ label = "Save changes" }: { label?: string }) {
  return (
    <div className="mt-6 flex items-center justify-end gap-2 border-t border-border/60 pt-4">
      <button className="h-9 rounded-lg border border-border bg-card px-3 text-sm hover:bg-muted">
        Cancel
      </button>
      <button className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-br from-primary to-accent px-4 text-sm font-semibold text-primary-foreground shadow-[0_0_24px_-6px_var(--primary)] hover:scale-[1.02] active:scale-[0.98]">
        {label}
      </button>
    </div>
  );
}

function ToggleRow({
  label,
  desc,
  defaultOn,
}: {
  label: string;
  desc: string;
  defaultOn: boolean;
}) {
  const [on, setOn] = useState(defaultOn);
  return (
    <div className="flex items-center justify-between rounded-lg px-2 py-3 hover:bg-muted/30">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      <button
        onClick={() => setOn((v) => !v)}
        className={cn(
          "relative h-6 w-11 rounded-full transition",
          on
            ? "bg-gradient-to-r from-primary to-accent shadow-[0_0_16px_-4px_var(--primary)]"
            : "bg-muted",
        )}
        aria-pressed={on}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow",
            on ? "left-[22px]" : "left-0.5",
          )}
        />
      </button>
    </div>
  );
}
