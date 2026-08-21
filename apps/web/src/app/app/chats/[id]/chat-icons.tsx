/**
 * Drawn rather than imported: four icons do not justify a dependency, and a
 * pack would ship the other four hundred.
 *
 * All four are `aria-hidden`, always. Each sits inside a control that carries
 * its own name — an icon that announces itself as well produces a button read
 * out twice.
 */
export function MicIcon() {
  return (
    // Sized in the icon, not by the caller: at 17px inside a 44px tap target it
    // read as an empty bordered box with a smudge in it.
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
      className="size-[22px] shrink-0"
    >
      <path
        d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CalendarIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      focusable="false"
      className="size-[18px] shrink-0"
    >
      <rect
        x="3.5"
        y="5"
        width="17"
        height="15"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M3.5 9.5h17M8 3v3M16 3v3"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      aria-hidden="true"
      focusable="false"
      className="size-[20px] shrink-0"
    >
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function PhotoIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      aria-hidden="true"
      focusable="false"
      className="size-[22px] shrink-0"
    >
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      {/* The horizon, drawn short of the frame on both sides so the corner
          radius does not clip it into a pair of stubs at 22px. */}
      <path
        d="M4.5 16.5 9 12l3.5 3.5L15.5 13l4 3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="9" cy="9.5" r="1.4" fill="currentColor" />
    </svg>
  );
}
