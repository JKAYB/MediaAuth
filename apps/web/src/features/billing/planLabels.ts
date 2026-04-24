export const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  individual_monthly: "Individual Monthly",
  individual_yearly: "Individual Yearly",
  team: "Team",
};

export function getPlanLabel(plan?: string | null) {
  if (!plan) return "";
  return (
    PLAN_LABELS[plan] ??
    plan
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  );
}
