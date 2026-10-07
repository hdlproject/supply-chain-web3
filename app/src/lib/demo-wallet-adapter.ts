"use client";

import {
  BaseMessageSignerWalletAdapter,
  WalletConnectionError,
  WalletNotConnectedError,
  WalletReadyState,
} from "@solana/wallet-adapter-base";
import type {
  SupportedTransactionVersions,
  TransactionOrVersionedTransaction,
  WalletError,
  WalletName,
} from "@solana/wallet-adapter-base";
import { Keypair, PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

import type { DemoRole } from "./demo-accounts";

/**
 * Backed by a demo account's keypair, fetched client-side from the gated
 * /api/demo-keypair route (never server-signed) — exists only so the demo
 * login buttons go through the exact same connect/sign code path as a
 * real wallet. See prd/v3_wallet_auth.md "Demo wallets".
 */
export function demoWalletName(role: DemoRole): WalletName {
  return `Demo ${role}` as WalletName;
}

export class DemoWalletAdapter extends BaseMessageSignerWalletAdapter {
  name: WalletName;
  url = "https://github.com/anza-xyz/wallet-adapter";
  icon =
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIyNCIgaGVpZ2h0PSIyNCI+PC9zdmc+";
  readyState = WalletReadyState.Loadable;
  supportedTransactionVersions: SupportedTransactionVersions = new Set(["legacy", 0]);

  private _publicKey: PublicKey | null = null;
  private _connecting = false;
  private _keypair: Keypair | null = null;
  private readonly role: DemoRole;

  constructor(role: DemoRole) {
    super();
    this.role = role;
    this.name = demoWalletName(role);
  }

  get publicKey(): PublicKey | null {
    return this._publicKey;
  }

  get connecting(): boolean {
    return this._connecting;
  }

  async connect(): Promise<void> {
    if (this.connected || this._connecting) return;
    this._connecting = true;
    try {
      const response = await fetch(`/api/demo-keypair?role=${this.role}`);
      if (!response.ok) {
        throw new WalletConnectionError(`Demo wallets are disabled (HTTP ${response.status})`);
      }
      const body = (await response.json()) as { secretKey: number[] };
      const keypair = Keypair.fromSecretKey(Uint8Array.from(body.secretKey));
      this._keypair = keypair;
      this._publicKey = keypair.publicKey;
      this.emit("connect", keypair.publicKey);
    } catch (error) {
      this.emit("error", error as WalletError);
      throw error;
    } finally {
      this._connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this._keypair = null;
    this._publicKey = null;
    this.emit("disconnect");
  }

  async signTransaction<
    T extends TransactionOrVersionedTransaction<this["supportedTransactionVersions"]>,
  >(transaction: T): Promise<T> {
    if (!this._keypair) throw new WalletNotConnectedError();
    if ("version" in transaction) {
      transaction.sign([this._keypair]);
    } else {
      transaction.partialSign(this._keypair);
    }
    return transaction;
  }

  async signMessage(message: Uint8Array): Promise<Uint8Array> {
    if (!this._keypair) throw new WalletNotConnectedError();
    return nacl.sign.detached(message, this._keypair.secretKey);
  }
}

const DEMO_ROLES: DemoRole[] = ["Admin", "Source", "Carrier", "Restaurant"];

export function createDemoWalletAdapters(): DemoWalletAdapter[] {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_WALLETS !== "true") return [];
  return DEMO_ROLES.map((role) => new DemoWalletAdapter(role));
}
