import { cn } from "@/lib/utils";

/** Lockup on dark UI (html.dark). */
const lockupLightSrc = "/brand/Light-Logo.png";
/** Lockup on light UI. */
const lockupDarkSrc = "/brand/Dark-Logo.png";

/** Intrinsic pixels — keeps layout ratio before paint (both assets match this frame). */
const LOCKUP_WIDTH = 899;
const LOCKUP_HEIGHT = 362;

export function Logo({
  className,
  compact = false,
  /** Sidebar: full nav width, fixed height; image is letterboxed with `object-contain`. */
  fullWidth = false,
}: {
  className?: string;
  compact?: boolean;
  fullWidth?: boolean;
}) {
  const slotClass = fullWidth
    ? "h-12 w-full min-w-0 sm:h-14"
    : compact
      ? "h-8 w-[min(100%,10.5rem)] max-w-[168px]"
      : "h-10 w-[min(100%,14rem)] sm:h-11 sm:w-[min(100%,15.5rem)]";

  return (
    <div
      className={cn(
        "relative touch-manipulation select-none [-webkit-tap-highlight-color:transparent]",
        slotClass,
        className,
      )}
    >
      <img
        src={lockupLightSrc}
        alt=""
        width={LOCKUP_WIDTH}
        height={LOCKUP_HEIGHT}
        decoding="async"
        className="hidden h-full w-full object-contain object-left dark:block"
      />
      <img
        src={lockupDarkSrc}
        alt=""
        width={LOCKUP_WIDTH}
        height={LOCKUP_HEIGHT}
        decoding="async"
        className="block h-full w-full object-contain object-left dark:hidden"
      />
    </div>
  );
}
