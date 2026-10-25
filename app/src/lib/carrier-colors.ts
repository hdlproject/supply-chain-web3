// Vivid enough to read against the dark theme (see globals.css :root), and
// distinguishable from one another without leaning on hue alone — the six
// differ in lightness as well (amber/lime bright, violet/rose mid).
export const CARRIER_COLOR_PALETTE = [
  "#34d399", // emerald (matches --accent)
  "#fbbf24", // amber
  "#a78bfa", // violet
  "#fb7185", // rose
  "#38bdf8", // sky
  "#a3e635", // lime
];

// Assigns each distinct wallet (base58 string) a stable color in
// first-seen order, wrapping around the palette once there are more
// carriers than colors -- so the same wallet always gets the same color
// everywhere a single call's map is used, even if it logged many
// movements across many batches.
export function carrierColorMap(carrierWallets: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const wallet of carrierWallets) {
    if (!map.has(wallet)) {
      map.set(wallet, CARRIER_COLOR_PALETTE[map.size % CARRIER_COLOR_PALETTE.length]);
    }
  }
  return map;
}
