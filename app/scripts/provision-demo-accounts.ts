import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { DEMO_ACCOUNTS, demoKeysDir, type DemoRole } from "../src/lib/demo-accounts";
import { configPda, getConnection, getProgramForKeypair } from "../src/lib/program";

const MIN_BALANCE_LAMPORTS = 1 * LAMPORTS_PER_SOL;
const AIRDROP_LAMPORTS = 2 * LAMPORTS_PER_SOL;

function ensureKeypair(keyFile: string): Keypair {
  const dir = demoKeysDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const filePath = path.join(dir, keyFile);
  if (existsSync(filePath)) {
    const secretKey = Uint8Array.from(JSON.parse(readFileSync(filePath, "utf8")));
    return Keypair.fromSecretKey(secretKey);
  }
  const keypair = Keypair.generate();
  writeFileSync(filePath, JSON.stringify(Array.from(keypair.secretKey)));
  return keypair;
}

async function ensureFunded(
  connection: ReturnType<typeof getConnection>,
  keypair: Keypair,
): Promise<void> {
  const balance = await connection.getBalance(keypair.publicKey);
  if (balance >= MIN_BALANCE_LAMPORTS) return;
  const signature = await connection.requestAirdrop(keypair.publicKey, AIRDROP_LAMPORTS);
  await connection.confirmTransaction(signature, "confirmed");
}

async function main() {
  const connection = getConnection();

  const keypairs = new Map<DemoRole, Keypair>();
  for (const account of DEMO_ACCOUNTS) {
    const keypair = ensureKeypair(account.keyFile);
    keypairs.set(account.role, keypair);
    console.log(`${account.role.padEnd(10)} ${keypair.publicKey.toBase58()}`);
  }

  for (const keypair of keypairs.values()) {
    await ensureFunded(connection, keypair);
  }

  const admin = keypairs.get("Admin")!;
  const adminProgram = getProgramForKeypair(admin);
  const [configAddress] = configPda();
  const existingConfig = await adminProgram.account.config.fetchNullable(configAddress);

  if (!existingConfig) {
    // `config` (const-seed PDA) and `systemProgram` (well-known constant
    // address) are both auto-resolved by the generated client — passing
    // either explicitly is a type error ("does not exist in type
    // ResolvedAccounts<...>").
    await adminProgram.methods.initializeConfig().accounts({ admin: admin.publicKey }).rpc();
    console.log("initialized config with admin =", admin.publicKey.toBase58());
  } else if (!existingConfig.bootstrapAuthority.equals(admin.publicKey)) {
    throw new Error(
      `On-chain Config.bootstrap_authority (${existingConfig.bootstrapAuthority.toBase58()}) does not match the local ` +
        `admin demo keypair (${admin.publicKey.toBase58()}). The PRD requires the Admin demo ` +
        "account to be the same keypair that ran initialize_config.",
    );
  } else {
    console.log("config already initialized, admin matches");
  }

  console.log("\nDemo keypairs ready. Admin is on-chain with ALL FOUR roles (bootstrap grants");
  console.log("Admin+Source+Carrier+Restaurant to the caller automatically). The separate");
  console.log("Source/Carrier/Restaurant demo wallets still need their roles granted");
  console.log("individually — log in as Admin and use the /admin page's Grant-role form:");
  for (const [role, keypair] of keypairs) {
    if (role === "Admin") continue;
    console.log(`  ${role.padEnd(10)} ${keypair.publicKey.toBase58()}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
