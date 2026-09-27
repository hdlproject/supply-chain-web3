import { describe, expect, it } from "vitest";

import { batchIdToHex, hexToBatchId, newBatchId, shortBatchId } from "./batch-id";

describe("batch id encoding", () => {
  it("round-trips hex <-> bytes", () => {
    const bytes = new Uint8Array([
      0x8f, 0x21, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07,
      0xc9,
    ]);
    const hex = batchIdToHex(bytes);
    expect(hex).toBe("8f21aabbccddeeff01020304050607c9");
    expect(hexToBatchId(hex)).toEqual(bytes);
  });

  it("rejects a hex string that isn't 32 characters", () => {
    expect(() => hexToBatchId("abcd")).toThrow(/32-character hex/);
  });

  it("rejects bytes that aren't 16 long", () => {
    expect(() => batchIdToHex(new Uint8Array(10))).toThrow(/16 bytes/);
  });

  it("generates a fresh 16-byte id each call", () => {
    const a = newBatchId();
    const b = newBatchId();
    expect(a.length).toBe(16);
    expect(batchIdToHex(a)).not.toBe(batchIdToHex(b));
  });

  it("shortens a hex id to first/last 4 chars", () => {
    expect(shortBatchId("8f21aabbccddeeff01020304050607c9")).toBe(`8f21${"…"}07c9`);
  });
});
