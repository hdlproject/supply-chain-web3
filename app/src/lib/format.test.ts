import BN from "bn.js";
import { describe, expect, it } from "vitest";

import {
  batchStatusLabel,
  batchStatusSlug,
  formatTimestamp,
  roleFormArg,
  roleLabel,
  shortWallet,
  sourceTypeFormArg,
  sourceTypeLabel,
} from "./format";

describe("enum label formatting", () => {
  it("labels roles", () => {
    expect(roleLabel({ admin: {} })).toBe("Admin");
    expect(roleLabel({ source: {} })).toBe("Source");
    expect(roleLabel({ carrier: {} })).toBe("Carrier");
    expect(roleLabel({ restaurant: {} })).toBe("Restaurant");
  });

  it("labels source types, including the multi-word variant", () => {
    expect(sourceTypeLabel({ traditionalMarket: {} })).toBe("Traditional market");
    expect(sourceTypeLabel({ farmer: {} })).toBe("Farmer");
  });

  it("labels and slugs batch status", () => {
    expect(batchStatusLabel({ inTransit: {} })).toBe("In transit");
    expect(batchStatusSlug({ inTransit: {} })).toBe("transit");
    expect(batchStatusSlug({ delivered: {} })).toBe("delivered");
    expect(batchStatusSlug({ registered: {} })).toBe("registered");
  });

  it("builds the enum arg shape the program expects from a UI value", () => {
    expect(roleFormArg("Admin")).toEqual({ admin: {} });
    expect(roleFormArg("Restaurant")).toEqual({ restaurant: {} });
    expect(sourceTypeFormArg("TraditionalMarket")).toEqual({ traditionalMarket: {} });
  });

  it("formats a unix timestamp, and treats 0 as unset", () => {
    expect(formatTimestamp(0)).toBe("—");
    expect(formatTimestamp(new BN(0))).toBe("—");
    const formatted = formatTimestamp(1_700_000_000);
    expect(formatted).not.toBe("—");
    expect(typeof formatted).toBe("string");
  });

  it("shortens a base58 pubkey", () => {
    expect(shortWallet({ toBase58: () => "8f21aaaaaaaaaaaaaaaaaaaaaaaaaaaac9a4" })).toBe(
      `8f21${"…"}c9a4`,
    );
  });
});
