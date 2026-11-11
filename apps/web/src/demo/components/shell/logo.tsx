/** Placeholder mark: stacked layers in brand blue. Swap for the real logo when it exists. */
export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="mos-logo" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#mos-logo)" />
      <path d="M8 13.5 16 9l8 4.5-8 4.5-8-4.5Z" fill="white" />
      <path d="m8 18 8 4.5 8-4.5" fill="none" stroke="white" strokeOpacity="0.7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
