import { readFileSync } from "node:fs";
import path from "node:path";

import { Keypair } from "@solana/web3.js";
import bcrypt from "bcryptjs";

export type DemoRole = "Admin" | "Source" | "Carrier" | "Restaurant";

export type DemoAccount = {
  username: string;
  passwordHash: string;
  role: DemoRole;
  keyFile: string;
};

// Demo/dev credentials only — see prd/v2_frontend.md "Users & authentication".
// Passwords are intentionally simple and public; this is not a production
// auth model, by design.
export const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    username: "admin",
    passwordHash: bcrypt.hashSync("admin-demo-pass", 10),
    role: "Admin",
    keyFile: "admin.json",
  },
  {
    username: "source",
    passwordHash: bcrypt.hashSync("source-demo-pass", 10),
    role: "Source",
    keyFile: "source.json",
  },
  {
    username: "carrier",
    passwordHash: bcrypt.hashSync("carrier-demo-pass", 10),
    role: "Carrier",
    keyFile: "carrier.json",
  },
  {
    username: "restaurant",
    passwordHash: bcrypt.hashSync("restaurant-demo-pass", 10),
    role: "Restaurant",
    keyFile: "restaurant.json",
  },
];

export function findDemoAccount(username: string): DemoAccount | undefined {
  return DEMO_ACCOUNTS.find((account) => account.username === username);
}

export function verifyPassword(account: DemoAccount, password: string): boolean {
  return bcrypt.compareSync(password, account.passwordHash);
}

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
      `Missing demo keypair for "${account.username}" at ${filePath}. Run "npm run provision" first.`,
    );
  }
  const secretKey = Uint8Array.from(JSON.parse(raw));
  return Keypair.fromSecretKey(secretKey);
}

export function loadKeypairForWallet(wallet: string): Keypair {
  for (const account of DEMO_ACCOUNTS) {
    const keypair = loadKeypair(account);
    if (keypair.publicKey.toBase58() === wallet) {
      return keypair;
    }
  }
  throw new Error(`No demo keypair matches wallet ${wallet}`);
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
