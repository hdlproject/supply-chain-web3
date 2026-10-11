"use server";

import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

import { resolveRoles } from "@/lib/guard";
import { roleHomePath } from "@/lib/demo-accounts";
import type { DemoRole } from "@/lib/demo-accounts";
import { buildMessage, consumeNonce, issueNonce, verifyNonceToken } from "@/lib/nonce";
import { createSession, destroySession } from "@/lib/session";

export async function requestNonce(): Promise<{ token: string; message: string }> {
  return issueNonce();
}

const ROLE_ORDER: DemoRole[] = ["Admin", "Source", "Carrier", "Restaurant"];

export async function verifyWalletLogin(
  token: string,
  pubkeyBase58: string,
  signatureBase64: string,
  expectedRole?: DemoRole,
): Promise<{ error: string | null }> {
  const payload = verifyNonceToken(token);
  if (!payload) {
    return { error: "Login challenge expired — try again." };
  }

  if (!consumeNonce(payload.nonce, payload.exp)) {
    return { error: "Login challenge already used — try again." };
  }

  let wallet: PublicKey;
  try {
    wallet = new PublicKey(pubkeyBase58);
  } catch {
    return { error: "Invalid wallet address." };
  }

  const message = buildMessage(payload.nonce);
  let verified: boolean;
  try {
    verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      Buffer.from(signatureBase64, "base64"),
      wallet.toBytes(),
    );
  } catch {
    return { error: "Signature verification failed." };
  }
  if (!verified) {
    return { error: "Signature verification failed." };
  }

  const roles = await resolveRoles(wallet);
  if (roles.length === 0) {
    return { error: "This wallet has no on-chain role. Ask an admin to register it." };
  }
  if (expectedRole && !roles.includes(expectedRole)) {
    return { error: `This wallet does not have the ${expectedRole} role.` };
  }

  await createSession({ wallet: wallet.toBase58(), roles });
  const preferred = expectedRole ?? ROLE_ORDER.find((role) => roles.includes(role))!;
  redirect(roleHomePath(preferred));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
