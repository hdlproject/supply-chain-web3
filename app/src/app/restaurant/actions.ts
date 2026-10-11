"use client";

import { hexToBatchId } from "@/lib/batch-id";
import { batchPda, getProgramForWallet, type SigningWallet } from "@/lib/program";
import { describeTxError } from "@/lib/tx-error";

export async function receiveBatch(wallet: SigningWallet, batchHex: string): Promise<{ error: string | null }> {
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
    return { error: describeTxError(error, "Failed to receive batch.") };
  }
  return { error: null };
}
