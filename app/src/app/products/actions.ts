"use client";

import { getProgramForWallet, type SigningWallet } from "@/lib/program";
import { describeTxError } from "@/lib/tx-error";

const MAX_SKU_CODE_LEN = 32;
const MAX_NAME_LEN = 64;

export async function registerProduct(
  wallet: SigningWallet,
  skuCode: string,
  name: string,
): Promise<{ error: string | null }> {
  const trimmedCode = skuCode.trim();
  const trimmedName = name.trim();
  if (!trimmedCode || trimmedCode.length > MAX_SKU_CODE_LEN) {
    return { error: `SKU code is required and must be ${MAX_SKU_CODE_LEN} characters or fewer.` };
  }
  if (!trimmedName || trimmedName.length > MAX_NAME_LEN) {
    return { error: `Name is required and must be ${MAX_NAME_LEN} characters or fewer.` };
  }

  const program = getProgramForWallet(wallet);
  try {
    // `roleAssignment` and `product` (seeds derived from `sku_code` below)
    // and `systemProgram` are all auto-resolved by the client.
    await program.methods
      .registerProduct(trimmedCode, trimmedName)
      .accounts({ registrant: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: describeTxError(error, "Failed to register product.") };
  }
  return { error: null };
}
