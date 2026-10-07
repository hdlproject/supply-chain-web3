import { AnchorProvider, Program } from "@coral-xyz/anchor";
import type { Wallet } from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { Transaction, VersionedTransaction } from "@solana/web3.js";

import idlJson from "../idl/supply_chain_web3.json";
import type { SupplyChainWeb3 } from "../idl/supply_chain_web3";

const CONFIG_SEED = Buffer.from("config");
const ROLE_SEED = Buffer.from("role");
const BATCH_SEED = Buffer.from("batch");
const MOVEMENT_SEED = Buffer.from("movement");

export function getRpcUrl(): string {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "http://127.0.0.1:8899";
}

export function isLocalnetRpc(url: string = getRpcUrl()): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}

export function getProgramId(): PublicKey {
  return new PublicKey(process.env.NEXT_PUBLIC_PROGRAM_ID ?? idlJson.address);
}

export function getConnection(): Connection {
  return new Connection(getRpcUrl(), "confirmed");
}

// The runtime IDL on disk is snake_case (matches the Rust source); the
// generated `SupplyChainWeb3` type is camelCased for TS ergonomics. The two
// shapes don't structurally match, so a direct `as` cast is rejected by TS —
// `as unknown as` is the standard Anchor client pattern for this.
function typedIdl(): SupplyChainWeb3 {
  return idlJson as unknown as SupplyChainWeb3;
}

class ReadonlyWallet implements Wallet {
  publicKey = PublicKey.default;
  payer = Keypair.generate();

  async signTransaction<T>(tx: T): Promise<T> {
    void tx;
    throw new Error("ReadonlyWallet cannot sign transactions");
  }

  async signAllTransactions<T>(txs: T[]): Promise<T[]> {
    void txs;
    throw new Error("ReadonlyWallet cannot sign transactions");
  }
}

// @coral-xyz/anchor's own `Wallet` class is unusable here: its ESM dist
// (dist/esm/index.js) assigns it via `exports.Wallet = require(...)` inside
// an `if (!isBrowser)` block — real CJS syntax leaking into a file bundlers
// must treat as ESM, so Turbopack's static analysis reports the export as
// missing at build time even though it resolves fine under plain Node. A
// small local equivalent (mirroring Anchor's own NodeWallet) sidesteps the
// broken re-export entirely.
class KeypairWallet implements Wallet {
  publicKey: PublicKey;
  payer: Keypair;

  constructor(keypair: Keypair) {
    this.payer = keypair;
    this.publicKey = keypair.publicKey;
  }

  async signTransaction<T extends Transaction | VersionedTransaction>(tx: T): Promise<T> {
    if ("version" in tx) {
      tx.sign([this.payer]);
    } else {
      tx.partialSign(this.payer);
    }
    return tx;
  }

  async signAllTransactions<T extends Transaction | VersionedTransaction>(
    txs: T[],
  ): Promise<T[]> {
    return Promise.all(txs.map((tx) => this.signTransaction(tx)));
  }
}

export function getReadProgram(): Program<SupplyChainWeb3> {
  const provider = new AnchorProvider(getConnection(), new ReadonlyWallet(), {
    commitment: "confirmed",
  });
  return new Program(typedIdl(), provider);
}

export function getProgramForWallet(
  wallet: Wallet,
  connection: Connection = getConnection(),
): Program<SupplyChainWeb3> {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(typedIdl(), provider);
}

export function getProgramForKeypair(keypair: Keypair): Program<SupplyChainWeb3> {
  return getProgramForWallet(new KeypairWallet(keypair));
}

export function configPda(programId: PublicKey = getProgramId()): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([CONFIG_SEED], programId);
}

export function roleAssignmentPda(
  wallet: PublicKey,
  programId: PublicKey = getProgramId(),
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([ROLE_SEED, wallet.toBuffer()], programId);
}

export function batchPda(
  batchId: Uint8Array,
  programId: PublicKey = getProgramId(),
): [PublicKey, number] {
  if (batchId.length !== 16) {
    throw new Error(`batchId must be 16 bytes, got ${batchId.length}`);
  }
  return PublicKey.findProgramAddressSync([BATCH_SEED, Buffer.from(batchId)], programId);
}

export function movementPda(
  batch: PublicKey,
  movementCount: number,
  programId: PublicKey = getProgramId(),
): [PublicKey, number] {
  const countBytes = Buffer.alloc(4);
  countBytes.writeUInt32LE(movementCount, 0);
  return PublicKey.findProgramAddressSync(
    [MOVEMENT_SEED, batch.toBuffer(), countBytes],
    programId,
  );
}
