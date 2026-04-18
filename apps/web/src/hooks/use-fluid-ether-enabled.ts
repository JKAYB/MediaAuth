import { useSyncExternalStore } from "react";

export type FluidEtherLandingMode = "off" | "lite" | "full";

/**
 * Landing fluid background:
 * - `off` — prefers reduced motion (static fallback).
 * - `lite` — touch-primary devices: lighter sim + autoDemo for background motion.
 * - `full` — desktop / fine pointer: full-quality sim.
 */
function subscribe(onStoreChange: () => void) {
  const mqs = [
    window.matchMedia("(prefers-reduced-motion: reduce)"),
    window.matchMedia("(hover: none) and (pointer: coarse)"),
  ];
  mqs.forEach((mq) => mq.addEventListener("change", onStoreChange));
  return () => mqs.forEach((mq) => mq.removeEventListener("change", onStoreChange));
}

function getSnapshot(): FluidEtherLandingMode {
  if (typeof window === "undefined") return "off";
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "off";
  if (window.matchMedia("(hover: none) and (pointer: coarse)").matches) return "lite";
  return "full";
}

function getServerSnapshot(): FluidEtherLandingMode {
  return "off";
}

export function useFluidEtherLandingMode(): FluidEtherLandingMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
