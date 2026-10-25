import { describe, expect, it } from "vitest";

import { CARRIER_COLOR_PALETTE, carrierColorMap } from "./carrier-colors";

describe("carrierColorMap", () => {
  it("assigns the first palette color to the first carrier seen", () => {
    const map = carrierColorMap(["wallet-A", "wallet-B"]);
    expect(map.get("wallet-A")).toBe(CARRIER_COLOR_PALETTE[0]);
    expect(map.get("wallet-B")).toBe(CARRIER_COLOR_PALETTE[1]);
  });

  it("gives repeated appearances of the same carrier the same color", () => {
    const map = carrierColorMap(["wallet-A", "wallet-B", "wallet-A", "wallet-A"]);
    expect(map.get("wallet-A")).toBe(map.get("wallet-A"));
    expect(map.size).toBe(2);
  });

  it("wraps around the palette once there are more carriers than colors", () => {
    const wallets = Array.from({ length: CARRIER_COLOR_PALETTE.length + 2 }, (_, i) => `wallet-${i}`);
    const map = carrierColorMap(wallets);
    expect(map.get(`wallet-${CARRIER_COLOR_PALETTE.length}`)).toBe(CARRIER_COLOR_PALETTE[0]);
    expect(map.get(`wallet-${CARRIER_COLOR_PALETTE.length + 1}`)).toBe(CARRIER_COLOR_PALETTE[1]);
  });

  it("returns an empty map for an empty list", () => {
    expect(carrierColorMap([]).size).toBe(0);
  });
});
