"use client";

import BN from "bn.js";

import { newBatchId } from "@/lib/batch-id";
import { sourceTypeFormArg } from "@/lib/format";
import { getProgramForWallet, type SigningWallet } from "@/lib/program";

const SOURCE_TYPES = ["Farmer", "Factory", "TraditionalMarket", "Supermarket"] as const;

export async function registerBatch(
  wallet: SigningWallet,
  ingredientName: string,
  quantityInput: string,
  sourceType: (typeof SOURCE_TYPES)[number],
): Promise<{ error: string | null }> {
  if (!ingredientName || ingredientName.length > 64) {
    return { error: "Ingredient name is required and must be 64 characters or fewer." };
  }
  if (!/^\d+$/.test(quantityInput)) {
    return { error: "Quantity must be a whole number." };
  }
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
        ingredientName,
        new BN(quantityInput),
        sourceTypeFormArg(sourceType) as never,
      )
      .accounts({ source: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to register batch." };
  }
  return { error: null };
}
