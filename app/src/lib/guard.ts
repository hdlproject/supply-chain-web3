import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import type { DemoRole } from "./demo-accounts";
import { roleHomePath } from "./demo-accounts";
import { getReadProgram, roleAssignmentPda } from "./program";
import { getSession } from "./session";

export type AuthedSession = {
  wallet: PublicKey;
  roles: DemoRole[];
};

export async function requireSession(): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return { wallet: new PublicKey(session.wallet), roles: session.roles };
}

// Next.js disallows mutating cookies during a Server Component render (the
// `destroySession()` cookie delete would throw if called directly from
// here) -- so a role mismatch redirects through the `/api/session-clear`
// route handler, which destroys the stale session and then forwards to
// `/login?error=unauthorized`. Without this, a session whose cached roles
// have gone stale (e.g. an admin revoked this wallet's role) would bounce
// forever between here and `/login`, which trusts the same stale session
// to redirect back to this very page.
const UNAUTHORIZED_REDIRECT = "/api/session-clear";

export async function requireAdmin(): Promise<AuthedSession> {
  const session = await requireSession();
  if (!session.roles.includes("Admin")) {
    redirect(UNAUTHORIZED_REDIRECT);
  }
  return session;
}

export async function requireRole(role: Exclude<DemoRole, "Admin">): Promise<AuthedSession> {
  const session = await requireSession();
  if (!session.roles.includes(role)) {
    redirect(UNAUTHORIZED_REDIRECT);
  }
  return session;
}

const ROLE_ORDER: DemoRole[] = ["Admin", "Source", "Carrier", "Restaurant"];

// One RoleAssignment fetch now yields everything -- Admin-ness is just
// another flag on the same account, so (unlike the single-role v3 model)
// there's no separate Config fetch needed here at all.
export async function resolveRoles(wallet: PublicKey): Promise<DemoRole[]> {
  const program = getReadProgram();
  const [rolePda] = roleAssignmentPda(wallet);
  const assignment = await program.account.roleAssignment.fetchNullable(rolePda);
  if (!assignment) {
    return [];
  }
  const roles: DemoRole[] = [];
  if (assignment.isAdmin) roles.push("Admin");
  if (assignment.isSource) roles.push("Source");
  if (assignment.isCarrier) roles.push("Carrier");
  if (assignment.isRestaurant) roles.push("Restaurant");
  return roles;
}

export async function resolveHomePath(wallet: PublicKey): Promise<string> {
  const roles = await resolveRoles(wallet);
  const preferred = ROLE_ORDER.find((role) => roles.includes(role));
  return preferred ? roleHomePath(preferred) : "/login";
}
