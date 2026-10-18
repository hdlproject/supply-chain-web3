"use client";

import { newBatchId } from "@/lib/batch-id";
import { sourceTypeFormArg } from "@/lib/format";
import { getProgramForWallet, type SigningWallet } from "@/lib/program";
import { describeTxError } from "@/lib/tx-error";

const SOURCE_TYPES = ["Farmer", "Factory", "TraditionalMarket", "Supermarket"] as const;

export async function registerBatch(
  wallet: SigningWallet,
  sourceType: (typeof SOURCE_TYPES)[number],
): Promise<{ error: string | null }> {
  if (!SOURCE_TYPES.includes(sourceType)) {
    return { error: "Choose a source type." };
  }

  const program = getProgramForWallet(wallet);
  const batchIdBytes = newBatchId();

  try {
    // `roleAssignment` (seeds derived from `source` below), `batch` (seeds
    // derived from the `batchId` arg) and `systemProgram` are all
    // auto-resolved by the client.
    await program.methods
      .registerBatch(
        Array.from(batchIdBytes),
        sourceTypeFormArg(sourceType) as never,
        0, // lineItemCount - will be set by add_line_item calls
      )
      .accounts({ source: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: describeTxError(error, "Failed to register batch.") };
  }
  return { error: null };
}
