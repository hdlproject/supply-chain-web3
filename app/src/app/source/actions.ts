"use client";

import BN from "bn.js";
import { Transaction } from "@solana/web3.js";

import { fetchAllProducts } from "@/lib/accounts";
import { newBatchId } from "@/lib/batch-id";
import { sourceTypeFormArg } from "@/lib/format";
import { batchPda, getProgramForWallet, type SigningWallet } from "@/lib/program";
import { describeTxError } from "@/lib/tx-error";

import { planLineItems, type ProductRow } from "./build-register-batch-instructions";

const SOURCE_TYPES = ["Farmer", "Factory", "TraditionalMarket", "Supermarket"] as const;

export async function registerBatch(
  wallet: SigningWallet,
  sourceType: (typeof SOURCE_TYPES)[number],
  rows: ProductRow[],
): Promise<{ error: string | null }> {
  if (!SOURCE_TYPES.includes(sourceType)) {
    return { error: "Choose a source type." };
  }

  let plan;
  try {
    const existing = await fetchAllProducts();
    const existingSkuCodes = new Set(existing.map((entry) => entry.account.skuCode));
    plan = planLineItems(rows, existingSkuCodes);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid product rows." };
  }

  const program = getProgramForWallet(wallet);
  const batchIdBytes = newBatchId();

  try {
    // `roleAssignment` (seeds derived from `source`/`registrant` below),
    // `batch`/`product`/`lineItem` (seeds derived from the args below) and
    // `systemProgram` are all auto-resolved by the client for every
    // instruction composed into this one transaction.
    const registerBatchIx = await program.methods
      .registerBatch(
        Array.from(batchIdBytes),
        sourceTypeFormArg(sourceType) as never,
        plan.items.length,
      )
      .accounts({ source: wallet.publicKey })
      .instruction();

    const registerProductIxs = await Promise.all(
      plan.newProducts.map((product) =>
        program.methods
          .registerProduct(product.skuCode, product.name)
          .accounts({ registrant: wallet.publicKey })
          .instruction(),
      ),
    );

    const [batchAccount] = batchPda(batchIdBytes);
    const addLineItemIxs = await Promise.all(
      plan.items.map((item) =>
        program.methods
          .addLineItem(item.index, item.skuCode, new BN(item.quantity))
          .accounts({ batch: batchAccount })
          .instruction(),
      ),
    );

    const tx = new Transaction().add(registerBatchIx, ...registerProductIxs, ...addLineItemIxs);
    await program.provider.sendAndConfirm?.(tx);
  } catch (error) {
    return { error: describeTxError(error, "Failed to register batch.") };
  }
  return { error: null };
}
