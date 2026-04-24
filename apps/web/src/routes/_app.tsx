import { createFileRoute, isRedirect, redirect } from "@tanstack/react-router";
import { AppLayout } from "@/components/layout/AppLayout";
import { prefetchMe } from "@/features/auth/hooks";
import { disableLiveDemo, isLiveDemo } from "@/lib/demo-mode";

export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ location }) => {
    if (typeof window === "undefined") return;
    if (isLiveDemo()) return;
    try {
      const me = await prefetchMe();
      const planSelected = Boolean(me.planSelected ?? me.plan_selected);
      if (me.must_change_password && location.pathname !== "/change-password") {
        console.info("[auth] redirect target", "/change-password");
        throw redirect({ to: "/change-password" });
      }
      if (!planSelected && location.pathname !== "/plans") {
        console.info("[auth] redirect target", "/plans");
        throw redirect({ to: "/plans" });
      }
      disableLiveDemo();
    } catch (e) {
      if (isRedirect(e)) throw e;
      console.info("[auth] redirect target", "/login");
      throw redirect({
        to: "/login",
        search: { redirect: location.pathname },
      });
    }
  },
  component: AppLayout,
});
