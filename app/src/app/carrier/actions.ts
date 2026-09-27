"use server";

import { revalidatePath } from "next/cache";

import type { ActionState } from "@/lib/action-state";
import { hexToBatchId } from "@/lib/batch-id";
import { loadKeypairForWallet } from "@/lib/demo-accounts";
import { requireRole } from "@/lib/guard";
import { batchPda, getProgramForKeypair } from "@/lib/program";

export async function logMovementAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireRole("Carrier");

  const batchHex = String(formData.get("batchId") ?? "");
  const stopType = String(formData.get("stopType") ?? "transit");
  const courierId = String(formData.get("courierId") ?? "").trim();
  const vehicleId = String(formData.get("vehicleId") ?? "").trim();
  const fromLocation = String(formData.get("fromLocation") ?? "").trim();
  const toLocation = String(formData.get("toLocation") ?? "").trim();

  let batchIdBytes: Uint8Array;
  try {
    batchIdBytes = hexToBatchId(batchHex);
  } catch {
    return { error: "Choose a batch." };
  }
  if (!fromLocation || fromLocation.length > 64 || !toLocation || toLocation.length > 64) {
    return { error: "From/to location are required and must be 64 characters or fewer." };
  }
  const isTransit = stopType === "transit";
  if (isTransit && (!courierId || !vehicleId)) {
    return { error: "Courier ID and vehicle ID are required for a transit stop." };
  }
  if (courierId.length > 32 || vehicleId.length > 32) {
    return { error: "Courier ID and vehicle ID must be 32 characters or fewer." };
  }

  const carrier = loadKeypairForWallet(session.wallet.toBase58());
  const program = getProgramForKeypair(carrier);
  const [batch] = batchPda(batchIdBytes);

  try {
    if (!(await program.account.batch.fetchNullable(batch))) {
      return { error: "That batch no longer exists." };
    }

    // `roleAssignment` (seeds derived from `carrier`) and `movement` (seeds
    // derived from `batch` and the batch's current `movementCount` field)
    // and `systemProgram` are all auto-resolved by the client — `batch`
    // itself isn't a PDA the client can derive (it has no `batchId` arg to
    // key off here), so it must be supplied explicitly.
    await program.methods
      .logMovement(
        isTransit ? courierId : null,
        isTransit ? vehicleId : null,
        fromLocation,
        toLocation,
      )
      .accounts({ carrier: carrier.publicKey, batch })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to log movement." };
  }

  revalidatePath("/carrier");
  return { error: null };
}
