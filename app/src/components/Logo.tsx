import { useId } from "react";

// Three linked nodes inside a hexagon: a batch handed along a chain.
export function LogoMark({ className = "brand-mark" }: { className?: string }) {
  const id = useId();
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={id} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" />
          <stop offset="0.55" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#818cf8" />
        </linearGradient>
      </defs>
      <path
        d="M16 2.5l11.7 6.75v13.5L16 29.5 4.3 22.75V9.25L16 2.5z"
        fill="rgba(52,211,153,0.07)"
        stroke={`url(#${id})`}
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M10.5 19.5l5.5-7 5.5 7"
        fill="none"
        stroke={`url(#${id})`}
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10.5" cy="19.5" r="2.3" fill={`url(#${id})`} />
      <circle cx="16" cy="12.5" r="2.3" fill={`url(#${id})`} />
      <circle cx="21.5" cy="19.5" r="2.3" fill={`url(#${id})`} />
    </svg>
  );
}

export function Wordmark() {
  return (
    <>
      Chain<span className="gradient-text">Trace</span>
    </>
  );
}
