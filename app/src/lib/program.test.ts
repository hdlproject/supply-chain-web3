import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";

import { batchPda, configPda, isLocalnetRpc, movementPda, roleAssignmentPda } from "./program";

const PROGRAM_ID = new PublicKey("5k3AeBoUR2LsjXT8XtddP9VfcnztLQyiK5YgYscPtReX");

describe("PDA derivation", () => {
  it("derives the config PDA from the literal 'config' seed", () => {
    const [expected] = PublicKey.findProgramAddressSync([Buffer.from("config")], PROGRAM_ID);
    const [actual] = configPda(PROGRAM_ID);
    expect(actual.equals(expected)).toBe(true);
  });

  it("derives distinct role assignment PDAs per wallet", () => {
    const walletA = PublicKey.unique();
    const walletB = PublicKey.unique();
    const [pdaA] = roleAssignmentPda(walletA, PROGRAM_ID);
    const [pdaB] = roleAssignmentPda(walletB, PROGRAM_ID);
    expect(pdaA.equals(pdaB)).toBe(false);

    const [expectedA] = PublicKey.findProgramAddressSync(
      [Buffer.from("role"), walletA.toBuffer()],
      PROGRAM_ID,
    );
    expect(pdaA.equals(expectedA)).toBe(true);
  });

  it("rejects a batch id that is not 16 bytes", () => {
    expect(() => batchPda(new Uint8Array(15), PROGRAM_ID)).toThrow(/16 bytes/);
  });

  it("derives the batch PDA from the 16-byte batch id", () => {
    const batchId = new Uint8Array(16).fill(7);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("batch"), Buffer.from(batchId)],
      PROGRAM_ID,
    );
    const [actual] = batchPda(batchId, PROGRAM_ID);
    expect(actual.equals(expected)).toBe(true);
  });

  it("derives distinct movement PDAs per movement count", () => {
    const batch = PublicKey.unique();
    const [first] = movementPda(batch, 0, PROGRAM_ID);
    const [second] = movementPda(batch, 1, PROGRAM_ID);
    expect(first.equals(second)).toBe(false);

    const countBytes = Buffer.alloc(4);
    countBytes.writeUInt32LE(0, 0);
    const [expected] = PublicKey.findProgramAddressSync(
      [Buffer.from("movement"), batch.toBuffer(), countBytes],
      PROGRAM_ID,
    );
    expect(first.equals(expected)).toBe(true);
  });
});

describe("isLocalnetRpc", () => {
  it("accepts 127.0.0.1 and localhost", () => {
    expect(isLocalnetRpc("http://127.0.0.1:8899")).toBe(true);
    expect(isLocalnetRpc("http://localhost:8899")).toBe(true);
  });

  it("rejects a public RPC url", () => {
    expect(isLocalnetRpc("https://api.devnet.solana.com")).toBe(false);
  });

  it("rejects a malformed url", () => {
    expect(isLocalnetRpc("not a url")).toBe(false);
  });
});
