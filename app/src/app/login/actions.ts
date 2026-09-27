"use server";

import { redirect } from "next/navigation";

import type { ActionState } from "@/lib/action-state";
import { DEMO_ACCOUNTS, findDemoAccount, loadKeypair, roleHomePath, verifyPassword } from "@/lib/demo-accounts";
import type { DemoRole } from "@/lib/demo-accounts";
import { createSession, destroySession } from "@/lib/session";

export async function loginWithPassword(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const username = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const account = findDemoAccount(username);
  if (!account || !verifyPassword(account, password)) {
    return { error: "Invalid username or password." };
  }

  const keypair = loadKeypair(account);
  await createSession({ username: account.username, wallet: keypair.publicKey.toBase58() });
  redirect(roleHomePath(account.role));
}

export async function demoLoginAction(role: DemoRole) {
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === role);
  if (!account) {
    throw new Error(`No demo account configured for role ${role}`);
  }
  const keypair = loadKeypair(account);
  await createSession({ username: account.username, wallet: keypair.publicKey.toBase58() });
  redirect(roleHomePath(account.role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
