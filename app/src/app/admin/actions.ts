"use client";

import { PublicKey } from "@solana/web3.js";

import { roleFormArg } from "@/lib/format";
import { getProgramForWallet, type SigningWallet } from "@/lib/program";

export async function assignRole(
  wallet: SigningWallet,
  walletInput: string,
  role: "Source" | "Carrier" | "Restaurant",
): Promise<{ error: string | null }> {
  let target: PublicKey;
  try {
    target = new PublicKey(walletInput.trim());
  } catch {
    return { error: "That doesn't look like a valid Solana wallet address." };
  }

  const program = getProgramForWallet(wallet);
  try {
    // `config` and `roleAssignment` (seeds derived from the `wallet` arg
    // below) and `systemProgram` are all auto-resolved by the client.
    await program.methods
      .assignRole(target, roleFormArg(role) as never)
      .accounts({ admin: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to assign role." };
  }
  return { error: null };
}
