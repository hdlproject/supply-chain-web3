"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { hexToBatchId } from "@/lib/batch-id";
import { loadKeypairForWallet } from "@/lib/demo-accounts";
import { requireRole } from "@/lib/guard";
import { batchPda, getProgramForKeypair } from "@/lib/program";

export async function receiveAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRole("Restaurant");

  const batchHex = String(formData.get("batchId") ?? "");
  let batchIdBytes: Uint8Array;
  try {
    batchIdBytes = hexToBatchId(batchHex);
  } catch {
    return { error: "Invalid batch." };
  }

  const restaurant = loadKeypairForWallet(session.wallet.toBase58());
  const program = getProgramForKeypair(restaurant);
  const [batch] = batchPda(batchIdBytes);

  try {
    // `roleAssignment` (seeds derived from `restaurant`) is auto-resolved;
    // `batch` isn't a PDA the client can derive here, so it's explicit.
    await program.methods
      .receiveAtRestaurant()
      .accounts({ restaurant: restaurant.publicKey, batch })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to receive batch." };
  }

  revalidatePath("/restaurant");
  return { error: null };
}
