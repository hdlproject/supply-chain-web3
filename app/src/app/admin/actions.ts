"use client";

import { PublicKey } from "@solana/web3.js";

import { roleFormArg } from "@/lib/format";
import { getProgramForWallet, type SigningWallet } from "@/lib/program";

type AssignableRole = "Admin" | "Source" | "Carrier" | "Restaurant";

function parseWallet(walletInput: string): { ok: true; pubkey: PublicKey } | { ok: false; error: string } {
  try {
    return { ok: true, pubkey: new PublicKey(walletInput.trim()) };
  } catch {
    return { ok: false, error: "That doesn't look like a valid Solana wallet address." };
  }
}

export async function grantRole(
  wallet: SigningWallet,
  walletInput: string,
  role: AssignableRole,
): Promise<{ error: string | null }> {
  const parsed = parseWallet(walletInput);
  if (!parsed.ok) return { error: parsed.error };

  const program = getProgramForWallet(wallet);
  try {
    // `adminRoleAssignment` (seeds derived from the signer), `targetRoleAssignment`
    // (seeds derived from the `wallet` arg below) and `systemProgram` are all
    // auto-resolved by the client.
    await program.methods
      .grantRole(parsed.pubkey, roleFormArg(role) as never)
      .accounts({ admin: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to grant role." };
  }
  return { error: null };
}

export async function revokeRole(
  wallet: SigningWallet,
  walletInput: string,
  role: AssignableRole,
): Promise<{ error: string | null }> {
  const parsed = parseWallet(walletInput);
  if (!parsed.ok) return { error: parsed.error };

  const program = getProgramForWallet(wallet);
  try {
    await program.methods
      .revokeRole(parsed.pubkey, roleFormArg(role) as never)
      .accounts({ admin: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to revoke role." };
  }
  return { error: null };
}
