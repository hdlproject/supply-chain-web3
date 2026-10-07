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

// Next.js disallows mutating cookies during a Server Component render (the
// `destroySession()` cookie delete would throw if called directly from
// here) -- so a role mismatch redirects through the `/api/session-clear`
// route handler, which destroys the stale session and then forwards to
// `/login?error=unauthorized`. Without this, a session whose cached role
// has gone stale (e.g. an admin reassigned this wallet to a different role)
// would bounce forever between here and `/login`, which trusts the same
// stale session to redirect back to this very page.
const UNAUTHORIZED_REDIRECT = "/api/session-clear?to=" + encodeURIComponent("/login?error=unauthorized");

export async function requireAdmin(): Promise<AuthedSession> {
  const session = await requireSession();
  if (session.role !== "Admin") {
    redirect(UNAUTHORIZED_REDIRECT);
  }
  return session;
}

export async function requireRole(role: Exclude<DemoRole, "Admin">): Promise<AuthedSession> {
  const session = await requireSession();
  if (session.role !== role) {
    redirect(UNAUTHORIZED_REDIRECT);
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
