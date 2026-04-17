import { createFileRoute, redirect } from "@tanstack/react-router";
import { AuthShell } from "./login";
import { getToken } from "@/lib/auth-storage";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>): { redirect?: string } => ({
    redirect: typeof search.redirect === "string" ? search.redirect : undefined,
  }),
  beforeLoad: () => {
    if (typeof window === "undefined") return;
    if (getToken()) throw redirect({ to: "/dashboard" });
  },
  head: () => ({
    meta: [
      { title: "Create account — MediaAuth" },
      {
        name: "description",
        content: "Create your MediaAuth workspace and start verifying media.",
      },
    ],
  }),
  component: () => <AuthShell mode="signup" />,
});
