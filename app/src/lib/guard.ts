import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import type { DemoRole } from "./demo-accounts";
import { roleHomePath } from "./demo-accounts";
import { roleLabel } from "./format";
import { configPda, getReadProgram, roleAssignmentPda } from "./program";
import { getSession } from "./session";

export type AuthedSession = {
  username: string;
  wallet: PublicKey;
};

export async function requireSession(): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return { username: session.username, wallet: new PublicKey(session.wallet) };
}

export async function requireAdmin(): Promise<AuthedSession> {
  const session = await requireSession();
  const program = getReadProgram();
  const [pda] = configPda();
  const config = await program.account.config.fetchNullable(pda);
  if (!config || !config.admin.equals(session.wallet)) {
    redirect("/login?error=unauthorized");
  }
  return session;
}

export async function requireRole(
  role: Exclude<DemoRole, "Admin">,
): Promise<AuthedSession> {
  const session = await requireSession();
  const program = getReadProgram();
  const [pda] = roleAssignmentPda(session.wallet);
  const assignment = await program.account.roleAssignment.fetchNullable(pda);
  if (!assignment || roleLabel(assignment.role) !== role) {
    redirect("/login?error=unauthorized");
  }
  return session;
}

export async function resolveHomePath(wallet: PublicKey): Promise<string> {
  const program = getReadProgram();

  const [cfgPda] = configPda();
  const config = await program.account.config.fetchNullable(cfgPda);
  if (config && config.admin.equals(wallet)) {
    return roleHomePath("Admin");
  }

  const [rolePda] = roleAssignmentPda(wallet);
  const assignment = await program.account.roleAssignment.fetchNullable(rolePda);
  if (!assignment) {
    return "/login";
  }
  return roleHomePath(roleLabel(assignment.role) as DemoRole);
}
