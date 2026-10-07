"use client";

import { hexToBatchId } from "@/lib/batch-id";
import type { Wallet } from "@coral-xyz/anchor";
import { batchPda, getProgramForWallet } from "@/lib/program";

export async function receiveBatch(wallet: Wallet, batchHex: string): Promise<{ error: string | null }> {
  let batchIdBytes: Uint8Array;
  try {
    batchIdBytes = hexToBatchId(batchHex);
  } catch {
    return { error: "Invalid batch." };
  }

  const program = getProgramForWallet(wallet);
  const [batch] = batchPda(batchIdBytes);

  try {
    // `roleAssignment` (seeds derived from `restaurant`) is auto-resolved;
    // `batch` isn't a PDA the client can derive here, so it's explicit.
    await program.methods
      .receiveAtRestaurant()
      .accounts({ restaurant: wallet.publicKey, batch })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to receive batch." };
  }
  return { error: null };
}
