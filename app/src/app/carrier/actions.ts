"use client";

import { hexToBatchId } from "@/lib/batch-id";
import { batchPda, getProgramForWallet, type SigningWallet } from "@/lib/program";
import { describeTxError } from "@/lib/tx-error";

export async function logMovement(
  wallet: SigningWallet,
  batchHex: string,
  isTransit: boolean,
  courierId: string,
  vehicleId: string,
  fromLocation: string,
  toLocation: string,
): Promise<{ error: string | null }> {
  let batchIdBytes: Uint8Array;
  try {
    batchIdBytes = hexToBatchId(batchHex);
  } catch {
    return { error: "Choose a batch." };
  }
  if (!fromLocation || fromLocation.length > 64 || !toLocation || toLocation.length > 64) {
    return { error: "From/to location are required and must be 64 characters or fewer." };
  }
  if (isTransit && (!courierId || !vehicleId)) {
    return { error: "Courier ID and vehicle ID are required for a transit stop." };
  }
  if (courierId.length > 32 || vehicleId.length > 32) {
    return { error: "Courier ID and vehicle ID must be 32 characters or fewer." };
  }

  const program = getProgramForWallet(wallet);
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
      .logMovement(isTransit ? courierId : null, isTransit ? vehicleId : null, fromLocation, toLocation)
      .accounts({ carrier: wallet.publicKey, batch })
      .rpc();
  } catch (error) {
    return { error: describeTxError(error, "Failed to log movement.") };
  }
  return { error: null };
}
