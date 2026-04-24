import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { addTeamMember, getMyTeam, removeTeamMember } from "@/lib/api";

export const Route = createFileRoute("/_app/team")({
  head: () => ({ meta: [{ title: "Team — Observyx" }] }),
  component: TeamPage,
});

function TeamPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const qc = useQueryClient();
  const teamQuery = useQuery({
    queryKey: ["team", "me"],
    queryFn: getMyTeam,
  });

  const onAdd = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      const created = await addTeamMember(email.trim());
      toast.success(`Member invited. Temporary password: ${created.temporary_password}`);
      setEmail("");
      await qc.invalidateQueries({ queryKey: ["team", "me"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add member");
    } finally {
      setBusy(false);
    }
  };

  const onRemove = async (userId: string) => {
    try {
      await removeTeamMember(userId);
      await qc.invalidateQueries({ queryKey: ["team", "me"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to remove member");
    }
  };

  if (teamQuery.isPending) return <div className="text-sm text-muted-foreground">Loading team…</div>;
  if (teamQuery.isError) return <div className="text-sm text-destructive">{teamQuery.error.message}</div>;

  const role = teamQuery.data.role;
  if (role !== "team_owner") {
    return <div className="text-sm text-muted-foreground">Only team owners can manage members.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-3xl font-semibold">Team management</h1>
        <p className="mt-2 text-sm text-muted-foreground">Add or remove team members.</p>
      </div>
      <div className="rounded-xl border border-border bg-card/60 p-4">
        <div className="flex gap-2">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="member@company.com"
            className="h-10 flex-1 rounded-md border border-border bg-input px-3 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void onAdd()}
            className="rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            Add member
          </button>
        </div>
      </div>
      <div className="rounded-xl border border-border bg-card/60">
        {(teamQuery.data.members || []).map((m) => (
          <div key={m.id} className="flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0">
            <div>
              <div className="text-sm font-medium">{m.email}</div>
              <div className="text-xs text-muted-foreground">
                {m.role} · {m.must_change_password ? "must change password" : "ready"}
              </div>
            </div>
            <button
              type="button"
              onClick={() => void onRemove(m.id)}
              className="rounded-md border border-border px-3 py-1.5 text-xs"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
