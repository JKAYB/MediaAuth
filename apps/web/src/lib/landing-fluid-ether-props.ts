export const LANDING_FLUID_FULL_BASE = {
  resolution: 0.4,
  iterationsPoisson: 16,
  iterationsViscous: 16,
  isViscous: false,
  BFECC: false,
  dt: 0.016,
  autoDemo: true,
  autoSpeed: 0.4,
  autoIntensity: 2.0,
  autoResumeDelay: 1000,
  autoRampDuration: 0.6,
  takeoverDuration: 0.25,
  mouseForce: 20,
  cursorSize: 100,
  isBounce: false,
} as const;

export const LANDING_FLUID_LITE_BASE = {
  ...LANDING_FLUID_FULL_BASE,
  mouseForce: 7,
  cursorSize: 100,
  resolution: 0.3,
  iterationsPoisson: 8,
  iterationsViscous: 8,
  autoIntensity: 1.6,
} as const;

/** Tailwind class for the CSS-only static fallback shown before WebGL initializes
 *  or when fluidMode === "off". Should approximate the look of the fluid at rest. */
export const LANDING_STATIC_FLUID_FALLBACK_CLASS =
  "absolute inset-0 bg-gradient-to-br from-primary/20 via-accent/10 to-transparent";