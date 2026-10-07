import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import type { DemoRole } from "./demo-accounts";
import { roleHomePath } from "./demo-accounts";
import { roleLabel } from "./format";
import { configPda, getReadProgram, roleAssignmentPda } from "./program";
import { getSession } from "./session";

export type AuthedSession = {
  wallet: PublicKey;
  role: DemoRole;
};

export async function requireSession(): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return { wallet: new PublicKey(session.wallet), role: session.role };
}

export async function requireAdmin(): Promise<AuthedSession> {
  const session = await requireSession();
  if (session.role !== "Admin") {
    redirect("/login?error=unauthorized");
  }
  return session;
}

export async function requireRole(role: Exclude<DemoRole, "Admin">): Promise<AuthedSession> {
  const session = await requireSession();
  if (session.role !== role) {
    redirect("/login?error=unauthorized");
  }
  return session;
}

export async function resolveRole(wallet: PublicKey): Promise<DemoRole | null> {
  const program = getReadProgram();

  const [cfgPda] = configPda();
  const config = await program.account.config.fetchNullable(cfgPda);
  if (config && config.admin.equals(wallet)) {
    return "Admin";
  }

  const [rolePda] = roleAssignmentPda(wallet);
  const assignment = await program.account.roleAssignment.fetchNullable(rolePda);
  if (!assignment) {
    return null;
  }
  return roleLabel(assignment.role) as DemoRole;
}

export async function resolveHomePath(wallet: PublicKey): Promise<string> {
  const role = await resolveRole(wallet);
  return role ? roleHomePath(role) : "/login";
}
