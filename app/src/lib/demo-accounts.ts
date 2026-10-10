import { readFileSync } from "node:fs";
import path from "node:path";

import { Keypair } from "@solana/web3.js";

export type DemoRole = "Admin" | "Source" | "Carrier" | "Restaurant";

export type DemoAccount = {
  role: DemoRole;
  keyFile: string;
};

// Demo keypairs only — see prd/v3_wallet_auth.md "Demo wallets" and
// prd/v4_multi_role.md. These are NOT credentials: there's no password
// anymore. A wallet's actual authority comes entirely from its on-chain
// RoleAssignment (Admin is just one of its four flags now, not a separate
// Config.admin check) — checked at login via resolveRoles. This list only
// maps a role label to which keypair file backs that role's demo button.
export const DEMO_ACCOUNTS: DemoAccount[] = [
  { role: "Admin", keyFile: "admin.json" },
  { role: "Source", keyFile: "source.json" },
  { role: "Carrier", keyFile: "carrier.json" },
  { role: "Restaurant", keyFile: "restaurant.json" },
];

export function demoKeysDir(): string {
  return process.env.DEMO_KEYS_DIR ?? path.join(process.cwd(), ".demo-keys");
}

export function loadKeypair(account: DemoAccount): Keypair {
  // turbopackIgnore: this path is env/cwd-driven at request time (custodial
  // demo keys, not a build asset) — without the ignore comment, Turbopack's
  // static analysis traces and bundles the whole project as server output.
  const filePath = path.join(/* turbopackIgnore: true */ demoKeysDir(), account.keyFile);
  let raw: string;
  try {
    raw = readFileSync(/* turbopackIgnore: true */ filePath, "utf8");
  } catch {
    throw new Error(
      `Missing demo keypair for role "${account.role}" at ${filePath}. Run "npm run provision" first.`,
    );
  }
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

export function roleHomePath(role: DemoRole): string {
  switch (role) {
    case "Admin":
      return "/admin";
    case "Source":
      return "/source";
    case "Carrier":
      return "/carrier";
    case "Restaurant":
      return "/restaurant";
  }
}
