"use server";

import { revalidatePath } from "next/cache";
import BN from "bn.js";

import type { ActionState } from "@/lib/action-state";
import { newBatchId } from "@/lib/batch-id";
import { loadKeypairForWallet } from "@/lib/demo-accounts";
import { sourceTypeFormArg } from "@/lib/format";
import { requireRole } from "@/lib/guard";
import { getProgramForKeypair } from "@/lib/program";

const SOURCE_TYPES = ["Farmer", "Factory", "TraditionalMarket", "Supermarket"] as const;

export async function registerBatchAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRole("Source");

  const ingredientName = String(formData.get("ingredientName") ?? "").trim();
  const quantityInput = String(formData.get("quantity") ?? "").trim();
  const sourceType = String(formData.get("sourceType") ?? "") as (typeof SOURCE_TYPES)[number];

  if (!ingredientName || ingredientName.length > 64) {
    return { error: "Ingredient name is required and must be 64 characters or fewer." };
  }
  if (!/^\d+$/.test(quantityInput)) {
    return { error: "Quantity must be a whole number." };
  }
  if (!SOURCE_TYPES.includes(sourceType)) {
    return { error: "Choose a source type." };
  }

  const source = loadKeypairForWallet(session.wallet.toBase58());
  const program = getProgramForKeypair(source);
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
      .accounts({ source: source.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to register batch." };
  }

  revalidatePath("/source");
  return { error: null };
}
