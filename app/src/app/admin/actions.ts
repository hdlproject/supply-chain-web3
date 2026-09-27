"use server";

import { revalidatePath } from "next/cache";
import { PublicKey } from "@solana/web3.js";

import type { ActionState } from "@/lib/action-state";
import { loadKeypairForWallet } from "@/lib/demo-accounts";
import { roleFormArg } from "@/lib/format";
import { requireAdmin } from "@/lib/guard";
import { getProgramForKeypair } from "@/lib/program";

export async function assignRoleAction(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const session = await requireAdmin();

  const walletInput = String(formData.get("wallet") ?? "").trim();
  const role = String(formData.get("role") ?? "") as "Source" | "Carrier" | "Restaurant";

  let wallet: PublicKey;
  try {
    wallet = new PublicKey(walletInput);
  } catch {
    return { error: "That doesn't look like a valid Solana wallet address." };
  }
  if (!["Source", "Carrier", "Restaurant"].includes(role)) {
    return { error: "Choose a role." };
  }

  const admin = loadKeypairForWallet(session.wallet.toBase58());
  const program = getProgramForKeypair(admin);

  try {
    // `config` and `roleAssignment` (seeds derived from the `wallet` arg
    // below) and `systemProgram` are all auto-resolved by the client.
    await program.methods
      .assignRole(wallet, roleFormArg(role) as never)
      .accounts({ admin: admin.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to assign role." };
  }

  revalidatePath("/admin");
  return { error: null };
}
