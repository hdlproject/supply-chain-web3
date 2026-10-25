import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#07090d",
          borderRadius: 14,
        }}
      >
        <svg width="48" height="48" viewBox="0 0 32 32">
          <defs>
            <linearGradient id="g" x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
              <stop stopColor="#34d399" />
              <stop offset="0.55" stopColor="#22d3ee" />
              <stop offset="1" stopColor="#818cf8" />
            </linearGradient>
          </defs>
          <path
            d="M16 2.5l11.7 6.75v13.5L16 29.5 4.3 22.75V9.25L16 2.5z"
            fill="none"
            stroke="url(#g)"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <path
            d="M10.5 19.5l5.5-7 5.5 7"
            fill="none"
            stroke="url(#g)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="10.5" cy="19.5" r="2.5" fill="url(#g)" />
          <circle cx="16" cy="12.5" r="2.5" fill="url(#g)" />
          <circle cx="21.5" cy="19.5" r="2.5" fill="url(#g)" />
        </svg>
      </div>
    ),
    size,
  );
}
