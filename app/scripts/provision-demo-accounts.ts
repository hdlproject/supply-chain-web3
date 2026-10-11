import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";

import { configPda, getConnection, getProgramForKeypair } from "../src/lib/program";

const MIN_BALANCE_LAMPORTS = 1 * LAMPORTS_PER_SOL;
const AIRDROP_LAMPORTS = 2 * LAMPORTS_PER_SOL;

// The bootstrap wallet (becomes Admin+Source+Carrier+Restaurant atomically
// via initialize_config) is a real wallet, not a disposable demo keypair —
// read straight from the same keypair file `make phantom-key` writes. No
// other role has a demo keypair to provision: every login (demo-labeled or
// not) now signs in with whatever wallet is actually connected, and any
// additional wallet gets its roles via the admin UI's Grant-role form.
function loadBootstrapKeypair(): Keypair {
  const keyPath =
    process.env.PHANTOM_KEY_PATH ?? path.join(os.homedir(), ".config", "solana", "phantom-deploy.json");
  if (!existsSync(keyPath)) {
    throw new Error(
      `No bootstrap keypair at ${keyPath}. Run "make phantom-key" first, or set PHANTOM_KEY_PATH ` +
        "to an existing keypair file.",
    );
  }
  const secretKey = Uint8Array.from(JSON.parse(readFileSync(keyPath, "utf8")));
  return Keypair.fromSecretKey(secretKey);
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

  const admin = loadBootstrapKeypair();
  console.log(`${"Admin".padEnd(10)} ${admin.publicKey.toBase58()} (bootstrap wallet)`);

  await ensureFunded(connection, admin);

  const adminProgram = getProgramForKeypair(admin);
  const [configAddress] = configPda();
  const existingConfig = await adminProgram.account.config.fetchNullable(configAddress);

  if (!existingConfig) {
    // `config` (const-seed PDA) and `systemProgram` (well-known constant
    // address) are both auto-resolved by the generated client — passing
    // either explicitly is a type error ("does not exist in type
    // ResolvedAccounts<...>").
    await adminProgram.methods.initializeConfig().accounts({ admin: admin.publicKey }).rpc();
    console.log("initialized config with bootstrap wallet =", admin.publicKey.toBase58());
  } else if (!existingConfig.bootstrapAuthority.equals(admin.publicKey)) {
    throw new Error(
      `On-chain Config.bootstrap_authority (${existingConfig.bootstrapAuthority.toBase58()}) does not match the ` +
        `configured bootstrap keypair (${admin.publicKey.toBase58()}). This program has already been bootstrapped ` +
        "by a different wallet — there is no migration path for Config/RoleAssignment's layout " +
        "(or for who holds bootstrap_authority); run a fresh --reset + redeploy + re-provision.",
    );
  } else {
    console.log("config already initialized, bootstrap wallet matches");
  }

  console.log("\nBootstrap wallet", admin.publicKey.toBase58(), "is on-chain with ALL FOUR roles");
  console.log("(Admin+Source+Carrier+Restaurant, granted automatically at bootstrap). Connect that");
  console.log("wallet for real (WalletMultiButton + \"Sign in with wallet\", or any of the login");
  console.log("page's \"Demo login as ...\" shortcuts, which just sign in with whatever's");
  console.log("connected) to act with any of its roles.");
  console.log("\nAny other wallet needs its roles granted individually — log in as Admin and use");
  console.log("the /admin page's Grant-role form.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
