# v3 Wallet Authentication Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the frontend's username/password + server-custodial-signing auth model with real wallet-signature authentication (Sign-In-With-Solana style), where the on-chain `RoleAssignment`/`Config.admin` is the sole user registry and every on-chain action is signed by the user's own connected wallet instead of a server-held keypair.

**Architecture:** Wrap the Next.js app in `@solana/wallet-adapter-react`'s `ConnectionProvider`/`WalletProvider` (real wallets auto-detected via the Wallet Standard; a custom `DemoWalletAdapter` class added for the four demo buttons, backed by keypair bytes fetched from a gated, localnet-only API route). Login becomes: issue a signed nonce → wallet signs it → server verifies the signature and looks up the wallet's role on-chain → session cookie stores `{wallet, role}`. Every mutating instruction call (`assign_role`, `register_batch`, `log_movement`, `receive_at_restaurant`) moves from a Next.js Server Action using a custodial keypair, to a client-side call using `useAnchorWallet()` so the connected wallet signs directly.

**Tech Stack:** Next.js 16 / React 19 (existing), `@coral-xyz/anchor` (existing), new: `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`, `@solana/wallet-adapter-base`, `tweetnacl` (explicit dependency; was previously only a transitive dep of `@solana/web3.js`).

**Spec:** [prd/v3_wallet_auth.md](../../../prd/v3_wallet_auth.md)

## Global Constraints

- Work happens in `app/` (the Next.js project), not the Rust program — this plan makes zero changes to `programs/supply-chain-web3/`.
- `@solana/wallet-adapter-react`/`-react-ui`/`-base` peer deps are permissive (`react: "*"`) — confirmed compatible with this project's React 19.2.8 / Next 16.3.6 via a real trial install + `tsc --noEmit -p tsconfig.json` (zero errors). Pin versions: `@solana/wallet-adapter-react@^0.15.39`, `@solana/wallet-adapter-react-ui@^0.9.39`, `@solana/wallet-adapter-base@^0.9.28`.
- Do **not** add `@solana/wallet-adapter-wallets` — it pulls in ~1000 transitive packages (WalletConnect, Torus, etc.) that aren't needed; real wallets (Phantom, Solflare, etc.) register themselves automatically via the Wallet Standard once `WalletProvider` is mounted, with no adapter package required.
- `tweetnacl@^1.0.3` ships its own types (`nacl.d.ts`) — no `@types/tweetnacl` needed.
- Anchor's `Wallet` interface (`@coral-xyz/anchor`, `dist/esm/provider.d.ts`) is `{ signTransaction, signAllTransactions, publicKey, payer?: Keypair }` — `payer` is optional, so `useAnchorWallet()`'s return value (`AnchorWallet | undefined`, no `payer` field) satisfies it directly. No adapter shim needed to pass a connected wallet into `new AnchorProvider(connection, wallet, opts)`.
- Bounded lengths unchanged from v1/v2 (`ingredientName` ≤ 64 bytes, `fromLocation`/`toLocation` ≤ 64 bytes, `courierId`/`vehicleId` ≤ 32 bytes) — existing client-side validation in the four action files stays as-is, just moves from server to client.
- Run the frontend test suite with `npm run test` (vitest, `node` environment — see `app/vitest.config.ts`) from inside `app/`. Run the dev server with `make web` (repo root) or `npm run dev` (inside `app/`) for manual verification.
- Several steps in this plan have **no automated test** and are marked "Manual verification" instead — this matches existing project convention: `accounts.ts`'s `fetch*` functions (which hit a live RPC) have zero unit tests today for the same reason (`app/src/lib/program.test.ts` only tests the pure PDA-derivation functions). Browser wallet-connect flows can't be exercised by vitest's `node` environment either. Do not invent a mocking framework to force coverage here — follow the project's existing pattern.

---

## Task 1: Wallet-adapter plumbing (providers, demo wallet adapter, gated route)

**Files:**
- Modify: `app/package.json` (add `@solana/wallet-adapter-react`, `@solana/wallet-adapter-react-ui`, `@solana/wallet-adapter-base`, `tweetnacl`)
- Modify: `app/.env.local.example` (document `NEXT_PUBLIC_ENABLE_DEMO_WALLETS`)
- Modify: `app/.env.local` (add the same var, set to `true` for local dev — this file is gitignored, editing it doesn't commit anything)
- Modify: `app/src/lib/program.ts` (add `isLocalnetRpc`)
- Create: `app/src/lib/program.test.ts` (append a test — file exists, add cases)
- Create: `app/src/lib/demo-wallet-adapter.ts`
- Create: `app/src/app/api/demo-keypair/route.ts`
- Create: `app/src/app/providers.tsx`
- Modify: `app/src/app/layout.tsx` (wrap `{children}` in `<Providers>`)

**Interfaces:**
- Consumes: `DemoRole`, `DEMO_ACCOUNTS`, `loadKeypair` from `app/src/lib/demo-accounts.ts` (unchanged in this task); `getRpcUrl` from `app/src/lib/program.ts`.
- Produces: `isLocalnetRpc(url?: string): boolean` (program.ts), `DemoWalletAdapter` class + `demoWalletName(role): WalletName` + `createDemoWalletAdapters(): DemoWalletAdapter[]` (demo-wallet-adapter.ts), the `GET /api/demo-keypair?role=<Role>` route, `Providers` component wrapping the app in wallet-adapter context.

- [ ] **Step 1: Add the dependencies**

In `app/package.json`, add to `"dependencies"`:
```json
"@solana/wallet-adapter-base": "^0.9.28",
"@solana/wallet-adapter-react": "^0.15.39",
"@solana/wallet-adapter-react-ui": "^0.9.39",
"tweetnacl": "^1.0.3",
```
Run: `cd app && npm install`

- [ ] **Step 2: Document and set the demo-wallets env flag**

Append to `app/.env.local.example`:
```
NEXT_PUBLIC_ENABLE_DEMO_WALLETS=true
```
Append the same line to `app/.env.local` (gitignored — this just makes local dev work; never set `true` against anything but localnet).

- [ ] **Step 3: Add `isLocalnetRpc` to `program.ts`**

In `app/src/lib/program.ts`, add after `getRpcUrl`:
```ts
export function isLocalnetRpc(url: string = getRpcUrl()): boolean {
  try {
    const hostname = new URL(url).hostname;
    return hostname === "127.0.0.1" || hostname === "localhost";
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Write the failing test for `isLocalnetRpc`**

In `app/src/lib/program.test.ts`, add inside the existing `describe("PDA derivation", ...)` block's file (as a new top-level `describe`, after the existing one):
```ts
import { isLocalnetRpc } from "./program";

describe("isLocalnetRpc", () => {
  it("accepts 127.0.0.1 and localhost", () => {
    expect(isLocalnetRpc("http://127.0.0.1:8899")).toBe(true);
    expect(isLocalnetRpc("http://localhost:8899")).toBe(true);
  });

  it("rejects a public RPC url", () => {
    expect(isLocalnetRpc("https://api.devnet.solana.com")).toBe(false);
  });

  it("rejects a malformed url", () => {
    expect(isLocalnetRpc("not a url")).toBe(false);
  });
});
```
(Add the `isLocalnetRpc` import to the existing `import { ... } from "./program";` line at the top of the file rather than a second import statement.)

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd app && npm run test -- program.test.ts`
Expected: FAIL — `isLocalnetRpc` is not exported yet (if Step 3 hasn't landed) or passes trivially once it has. Since Steps 3 and 4 are both part of this single step-pair in practice, run this immediately after Step 3's code exists but before double-checking it — if you implement Step 3 first, this will already pass; that's fine, the point is confirming the test actually exercises the new function (temporarily comment out the `isLocalnetRpc` export and re-run to see it fail with "is not a function", then restore it).

- [ ] **Step 6: Create the demo wallet adapter**

Create `app/src/lib/demo-wallet-adapter.ts`:
```ts
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
```

- [ ] **Step 7: Create the gated demo-keypair route**

Create `app/src/app/api/demo-keypair/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";

import { DEMO_ACCOUNTS, loadKeypair } from "@/lib/demo-accounts";
import { getRpcUrl, isLocalnetRpc } from "@/lib/program";

export async function GET(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_ENABLE_DEMO_WALLETS !== "true" || !isLocalnetRpc(getRpcUrl())) {
    return NextResponse.json({ error: "Demo wallets are disabled" }, { status: 404 });
  }

  const role = request.nextUrl.searchParams.get("role");
  const account = DEMO_ACCOUNTS.find((candidate) => candidate.role === role);
  if (!account) {
    return NextResponse.json({ error: "Unknown demo role" }, { status: 400 });
  }

  try {
    const keypair = loadKeypair(account);
    return NextResponse.json({ secretKey: Array.from(keypair.secretKey) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load demo keypair" },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 8: Create the Providers component**

Create `app/src/app/providers.tsx`:
```tsx
"use client";

import { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import type { Adapter } from "@solana/wallet-adapter-base";

import { getRpcUrl } from "@/lib/program";
import { createDemoWalletAdapters } from "@/lib/demo-wallet-adapter";

import "@solana/wallet-adapter-react-ui/styles.css";

export function Providers({ children }: { children: React.ReactNode }) {
  const endpoint = getRpcUrl();
  const wallets = useMemo<Adapter[]>(() => createDemoWalletAdapters(), []);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
```

- [ ] **Step 9: Wrap the root layout**

In `app/src/app/layout.tsx`, add the import and wrap `{children}`:
```tsx
import { Providers } from "./providers";
```
Change:
```tsx
      <body>{children}</body>
```
to:
```tsx
      <body>
        <Providers>{children}</Providers>
      </body>
```

- [ ] **Step 10: Run the full test suite**

Run: `cd app && npm run test`
Expected: all existing tests still pass (22 previously + the 3 new `isLocalnetRpc` cases = 25), output pristine.

- [ ] **Step 11: Manual verification**

Run `make web` (repo root) or `npm run dev` (inside `app/`). Open `http://localhost:3000` (or whatever port it picks). Confirm:
- The app loads with no console errors (existing username/password login still works — nothing about the login flow changes in this task).
- `curl http://localhost:3000/api/demo-keypair?role=Admin` returns a JSON body with a `secretKey` array (demo wallets are enabled locally per Step 2).
- `NEXT_PUBLIC_ENABLE_DEMO_WALLETS=false npm run dev` (or temporarily commenting out the env var) makes the same curl return 404 — confirms the gate actually gates. Restore the env var afterward.

- [ ] **Step 12: Commit**

```bash
cd app && git add package.json package-lock.json .env.local.example \
  src/lib/program.ts src/lib/program.test.ts src/lib/demo-wallet-adapter.ts \
  src/app/api/demo-keypair/route.ts src/app/providers.tsx src/app/layout.tsx
git commit -m "feat: add wallet-adapter providers, demo wallet adapter, gated demo-keypair route"
```
(`.env.local` is gitignored — nothing to add there.)

---

## Task 2: Nonce sign/verify helpers

**Files:**
- Create: `app/src/lib/nonce.ts`
- Create: `app/src/lib/nonce.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1.
- Produces: `issueNonce(): { token: string; message: string }`, `buildMessage(nonce: string): string`, `verifyNonceToken(token: string): { nonce: string; exp: number } | null` (nonce.ts). Task 3 adds `resolveRole` to `guard.ts` itself (as part of that task's full rewrite of the file) rather than here, to avoid writing the same function twice across two tasks — this task is nonce logic only.

- [ ] **Step 1: Write the failing test**

Create `app/src/lib/nonce.test.ts`:
```ts
import { beforeAll, describe, expect, it } from "vitest";

import { buildMessage, issueNonce, verifyNonceToken } from "./nonce";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("login nonce", () => {
  it("round-trips a freshly issued token", () => {
    const { token, message } = issueNonce();
    const payload = verifyNonceToken(token);
    expect(payload).not.toBeNull();
    expect(message).toBe(buildMessage(payload!.nonce));
  });

  it("rejects a tampered token", () => {
    const { token } = issueNonce();
    const [body, signature] = token.split(".");
    const tamperedBody = Buffer.from(JSON.stringify({ nonce: "forged", exp: Date.now() + 60_000 })).toString(
      "base64url",
    );
    expect(verifyNonceToken(`${tamperedBody}.${signature}`)).toBeNull();
  });

  it("rejects an expired token", () => {
    const expiredBody = Buffer.from(
      JSON.stringify({ nonce: "abc", exp: Date.now() - 1000 }),
    ).toString("base64url");
    // Re-sign it correctly so only expiry is being tested, not the signature check.
    const { createHmac } = require("node:crypto");
    const signature = createHmac("sha256", process.env.SESSION_SECRET!)
      .update(expiredBody)
      .digest()
      .toString("base64url");
    expect(verifyNonceToken(`${expiredBody}.${signature}`)).toBeNull();
  });

  it("rejects a malformed token", () => {
    expect(verifyNonceToken("not-a-real-token")).toBeNull();
    expect(verifyNonceToken("")).toBeNull();
  });

  it("each issued nonce is unique", () => {
    const a = issueNonce();
    const b = issueNonce();
    expect(a.token).not.toBe(b.token);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm run test -- nonce.test.ts`
Expected: FAIL — `./nonce` module doesn't exist yet.

- [ ] **Step 3: Create `nonce.ts`**

Create `app/src/lib/nonce.ts`:
```ts
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const NONCE_TTL_MS = 5 * 60 * 1000;

export type NonceTokenPayload = {
  nonce: string;
  exp: number;
};

function secret(): string {
  const value = process.env.SESSION_SECRET;
  if (!value) {
    throw new Error("SESSION_SECRET is not set");
  }
  return value;
}

function base64url(input: Buffer): string {
  return input.toString("base64url");
}

/**
 * The server never stores issued nonces anywhere (no session/db row) — it
 * signs {nonce, exp} the same way session.ts signs a session payload, and
 * re-verifies that signature later. A short exp (5 min) is what bounds
 * replay, not server-side single-use tracking.
 */
export function issueNonce(): { token: string; message: string } {
  const nonce = base64url(randomBytes(24));
  const exp = Date.now() + NONCE_TTL_MS;
  const body = base64url(Buffer.from(JSON.stringify({ nonce, exp } satisfies NonceTokenPayload), "utf8"));
  const signature = base64url(createHmac("sha256", secret()).update(body).digest());
  return { token: `${body}.${signature}`, message: buildMessage(nonce) };
}

export function buildMessage(nonce: string): string {
  return `ChainTrace login\nnonce: ${nonce}`;
}

export function verifyNonceToken(token: string): NonceTokenPayload | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;

  const expected = base64url(createHmac("sha256", secret()).update(body).digest());
  const provided = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (provided.length !== wanted.length || !timingSafeEqual(provided, wanted)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof payload.nonce === "string" && typeof payload.exp === "number") {
      if (Date.now() > payload.exp) return null;
      return payload as NonceTokenPayload;
    }
    return null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm run test -- nonce.test.ts`
Expected: 5/5 passing.

- [ ] **Step 5: Run the full test suite**

Run: `cd app && npm run test`
Expected: all tests pass (25 from Task 1 + 5 new nonce tests = 30), output pristine.

- [ ] **Step 6: Commit**

```bash
cd app && git add src/lib/nonce.ts src/lib/nonce.test.ts
git commit -m "feat: add signed login-nonce issue/verify helpers"
```

---

## Task 3: Wallet-signature login flow (replaces username/password)

**Files:**
- Modify: `app/src/lib/session.ts` (`SessionPayload`: drop `username`, add `role: DemoRole`)
- Modify: `app/src/lib/session.test.ts` (update payload shape)
- Modify: `app/src/lib/guard.ts` (`AuthedSession` drops `username`; `requireSession`/`requireAdmin`/`requireRole` read `session.role` directly instead of re-fetching on-chain each time; `resolveHomePath` calls `resolveRole`)
- Modify: `app/src/app/login/actions.ts` (replace `loginWithPassword`/`demoLoginAction` with `requestNonce`/`verifyWalletLogin`; keep `logoutAction`)
- Create: `app/src/lib/use-wallet-sign-in.ts`
- Rewrite: `app/src/app/login/LoginForm.tsx`
- Rewrite: `app/src/app/login/page.tsx`

**Interfaces:**
- Consumes: `issueNonce`/`buildMessage`/`verifyNonceToken` (Task 2's `nonce.ts`), `demoWalletName`/`createDemoWalletAdapters` (Task 1's `demo-wallet-adapter.ts`).
- Produces: `resolveRole(wallet: PublicKey): Promise<DemoRole | null>` (this task's rewrite of `guard.ts`); `requestNonce(): Promise<{ token: string; message: string }>`, `verifyWalletLogin(token: string, pubkeyBase58: string, signatureBase64: string): Promise<{ error: string | null }>` (login/actions.ts); `useWalletSignIn(): { signIn: () => Promise<void>; error: string | null; pending: boolean }` (use-wallet-sign-in.ts). Task 4's forms consume `requireRole`/`requireAdmin`'s simplified (no-RPC) behavior indirectly — no interface change for them, just faster.

- [ ] **Step 1: Write the failing test (session payload shape)**

Replace `app/src/lib/session.test.ts` with:
```ts
import { beforeAll, describe, expect, it } from "vitest";

import { signSession, verifySession } from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("session token signing", () => {
  it("round-trips a valid payload", () => {
    const token = signSession({ wallet: "abc123", role: "Source", iat: 1000 });
    expect(verifySession(token)).toEqual({ wallet: "abc123", role: "Source", iat: 1000 });
  });

  it("rejects a tampered body", () => {
    const token = signSession({ wallet: "abc123", role: "Source", iat: 1000 });
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ wallet: "attacker", role: "Admin", iat: 1000 }),
    ).toString("base64url");
    expect(verifySession(`${tamperedBody}.${signature}`)).toBeNull();
  });

  it("rejects a malformed or empty token", () => {
    expect(verifySession("not-a-real-token")).toBeNull();
    expect(verifySession("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm run test -- session.test.ts`
Expected: FAIL — `verifySession` still requires/returns a `username` field, type/shape mismatch.

- [ ] **Step 3: Update `session.ts`**

In `app/src/lib/session.ts`, change:
```ts
export type SessionPayload = {
  username: string;
  wallet: string;
  iat: number;
};
```
to:
```ts
import type { DemoRole } from "./demo-accounts";

export type SessionPayload = {
  wallet: string;
  role: DemoRole;
  iat: number;
};
```
And in `verifySession`, change the shape check from:
```ts
    if (
      typeof payload.username === "string" &&
      typeof payload.wallet === "string" &&
      typeof payload.iat === "number"
    ) {
```
to:
```ts
    if (
      typeof payload.wallet === "string" &&
      typeof payload.role === "string" &&
      typeof payload.iat === "number"
    ) {
```
`createSession`'s signature (`Omit<SessionPayload, "iat">`) and body are unchanged — it already just spreads whatever payload shape `SessionPayload` has.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm run test -- session.test.ts`
Expected: 3/3 passing.

- [ ] **Step 5: Update `guard.ts`'s `AuthedSession` and guard functions**

In `app/src/lib/guard.ts`, replace the whole file with:
```ts
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
```
`requireAdmin`/`requireRole` no longer hit the chain at all (they trust the session's cached `role`, which is the explicit, documented tradeoff from `prd/v3_wallet_auth.md`'s "Login flow" section) — only `resolveRole`/`resolveHomePath` (used at login time and on `/`) still read on-chain state. `resolveRole` has **no new automated test**: it requires a live on-chain `Config`/`RoleAssignment`, which this project's test suite doesn't spin up (same reason `accounts.ts`'s fetch functions are untested — see Global Constraints). This task's Step 12 manual-verification step exercises it end-to-end instead.

- [ ] **Step 6: Create the shared sign-in hook**

Create `app/src/lib/use-wallet-sign-in.ts`:
```ts
"use client";

import { useCallback, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import { requestNonce, verifyWalletLogin } from "@/app/login/actions";

export function useWalletSignIn() {
  const { publicKey, signMessage } = useWallet();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const signIn = useCallback(async () => {
    if (!publicKey || !signMessage) {
      setError("Connect a wallet first.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const { token, message } = await requestNonce();
      const signature = await signMessage(new TextEncoder().encode(message));
      const result = await verifyWalletLogin(
        token,
        publicKey.toBase58(),
        Buffer.from(signature).toString("base64"),
      );
      if (result.error) {
        setError(result.error);
      }
    } catch {
      setError("Sign-in failed. Try again.");
    } finally {
      setPending(false);
    }
  }, [publicKey, signMessage]);

  return { signIn, error, pending };
}
```
(`verifyWalletLogin` redirects internally on success via Next's `redirect()`, which throws a special control-flow error the framework intercepts — this `catch` only ever fires for a genuine failure, not for the redirect itself. This mirrors how `demoLoginAction`/`loginWithPassword` already relied on the same redirect-via-Server-Action behavior before this task.)

- [ ] **Step 7: Rewrite `login/actions.ts`**

Replace `app/src/app/login/actions.ts` with:
```ts
"use server";

import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

import { resolveRole } from "@/lib/guard";
import { roleHomePath } from "@/lib/demo-accounts";
import { buildMessage, issueNonce, verifyNonceToken } from "@/lib/nonce";
import { createSession, destroySession } from "@/lib/session";

export async function requestNonce(): Promise<{ token: string; message: string }> {
  return issueNonce();
}

export async function verifyWalletLogin(
  token: string,
  pubkeyBase58: string,
  signatureBase64: string,
): Promise<{ error: string | null }> {
  const payload = verifyNonceToken(token);
  if (!payload) {
    return { error: "Login challenge expired — try again." };
  }

  let wallet: PublicKey;
  try {
    wallet = new PublicKey(pubkeyBase58);
  } catch {
    return { error: "Invalid wallet address." };
  }

  const message = buildMessage(payload.nonce);
  const verified = nacl.sign.detached.verify(
    new TextEncoder().encode(message),
    Buffer.from(signatureBase64, "base64"),
    wallet.toBytes(),
  );
  if (!verified) {
    return { error: "Signature verification failed." };
  }

  const role = await resolveRole(wallet);
  if (!role) {
    return { error: "This wallet has no on-chain role. Ask an admin to register it." };
  }

  await createSession({ wallet: wallet.toBase58(), role });
  redirect(roleHomePath(role));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
```

- [ ] **Step 8: Rewrite `LoginForm.tsx`**

Replace `app/src/app/login/LoginForm.tsx` with:
```tsx
"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

import { useWalletSignIn } from "@/lib/use-wallet-sign-in";

export function LoginForm() {
  const { connected } = useWallet();
  const { signIn, error, pending } = useWalletSignIn();

  return (
    <div className="field" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <WalletMultiButton />
      {error ? <div className="field-error">{error}</div> : null}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={!connected || pending}
        onClick={signIn}
      >
        {pending ? "Signing in…" : "Sign in with wallet"}
      </button>
    </div>
  );
}
```

- [ ] **Step 9: Rewrite the login page**

Replace `app/src/app/login/page.tsx` with:
```tsx
import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import { resolveHomePath } from "@/lib/guard";
import { getSession } from "@/lib/session";
import type { DemoRole } from "@/lib/demo-accounts";

import { DemoLoginButton } from "./DemoLoginButton";
import { LoginForm } from "./LoginForm";

const DEMO_ROLES: { role: DemoRole; description: string }[] = [
  { role: "Admin", description: "Assign roles · view every batch & movement" },
  { role: "Source", description: "Register new batches" },
  { role: "Carrier", description: "Log movements in transit" },
  { role: "Restaurant", description: "Receive incoming batches" },
];

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect(await resolveHomePath(new PublicKey(session.wallet)));
  }

  return (
    <div className="login-shell">
      <div className="login-brand">
        <span
          style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--clay)" }}
        />
        ChainTrace
      </div>
      <div className="login-sub">
        Restaurant Ingredient Supply Chain — sign in with a wallet
      </div>
      <div className="login-columns">
        <div className="card">
          <div className="section-title">Sign in</div>
          <div className="section-sub">
            Connect a wallet and sign a login message. Your on-chain role is looked up
            automatically — no password.
          </div>
          <LoginForm />
        </div>
        <div className="card">
          <div className="section-title">Demo login</div>
          <div className="section-sub">
            One click — connects a demo wallet for that role and signs you in. Only available
            against localnet.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {DEMO_ROLES.map(({ role, description }) => (
              <DemoLoginButton role={role} description={description} key={role} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 10: Create the demo login button**

Create `app/src/app/login/DemoLoginButton.tsx`:
```tsx
"use client";

import { useEffect, useRef } from "react";
import { useWallet } from "@solana/wallet-adapter-react";

import type { DemoRole } from "@/lib/demo-accounts";
import { demoWalletName } from "@/lib/demo-wallet-adapter";
import { useWalletSignIn } from "@/lib/use-wallet-sign-in";

export function DemoLoginButton({ role, description }: { role: DemoRole; description: string }) {
  const { select, connect, connected, wallet, connecting } = useWallet();
  const { signIn, error, pending } = useWalletSignIn();
  const name = demoWalletName(role);
  const requested = useRef(false);

  // select() just marks this adapter as "selected" in context; it doesn't
  // connect on its own since Providers sets autoConnect={false}. Connect
  // once the selection has taken effect, then sign in once connected.
  useEffect(() => {
    if (requested.current && wallet?.adapter.name === name && !connected && !connecting) {
      connect().catch(() => {
        requested.current = false;
      });
    }
  }, [wallet, name, connected, connecting, connect]);

  useEffect(() => {
    if (requested.current && connected && wallet?.adapter.name === name) {
      requested.current = false;
      void signIn();
    }
  }, [connected, wallet, name, signIn]);

  const handleClick = () => {
    requested.current = true;
    select(name);
  };

  return (
    <div>
      <button type="button" className="btn btn-outline btn-block" onClick={handleClick} disabled={pending}>
        <span>
          <span style={{ display: "block", fontWeight: 600 }}>
            {pending ? `Signing in as ${role}…` : `Demo login as ${role}`}
          </span>
          <span
            style={{ display: "block", fontSize: 12, color: "var(--muted)", fontWeight: 400, marginTop: 2 }}
          >
            {description}
          </span>
        </span>
        <span style={{ color: "var(--muted)" }}>→</span>
      </button>
      {error ? <div className="field-error">{error}</div> : null}
    </div>
  );
}
```

- [ ] **Step 11: Run the full test suite**

Run: `cd app && npm run test`
Expected: all tests pass (30 from Task 2, `session.test.ts` now exercises the new shape — still 3 tests there, total unchanged at 30), output pristine.

- [ ] **Step 12: Manual verification**

Run `make web`. On `/login`:
- Run `npm run provision` first if you haven't (creates the four demo keypairs, funds them, and runs `initialize_config` + `assign_role` for all four — this script is unmodified until Task 5, so at this point in the plan it still assigns every role itself).
- Click "Demo login as Admin" — should connect the demo-admin wallet, sign the nonce, and redirect to `/admin`.
- Click each of the other three demo buttons — since `provision` already assigned their roles via the (still-unmodified) script, these should also successfully sign in and land on their respective dashboard. (After Task 5 removes the script's role-assignment, this same flow will require going through `/admin` first — re-verify then, per Task 5's own manual-verification step.)
- Confirm the old username/password fields are gone from `/login`.

- [ ] **Step 13: Commit**

```bash
cd app && git add src/lib/session.ts src/lib/session.test.ts src/lib/guard.ts \
  src/lib/use-wallet-sign-in.ts src/app/login/actions.ts src/app/login/LoginForm.tsx \
  src/app/login/page.tsx src/app/login/DemoLoginButton.tsx
git commit -m "feat: replace username/password login with wallet-signature auth"
```

---

## Task 4: Client-side signing for all four mutating actions

**Files:**
- Modify: `app/src/lib/program.ts` (add `getProgramForWallet`; refactor `getProgramForKeypair` to use it)
- Rewrite: `app/src/app/admin/actions.ts` → client function (was a Server Action)
- Rewrite: `app/src/app/admin/AssignRoleForm.tsx`
- Rewrite: `app/src/app/source/actions.ts` → client function
- Rewrite: `app/src/app/source/RegisterBatchForm.tsx`
- Rewrite: `app/src/app/carrier/actions.ts` → client function
- Rewrite: `app/src/app/carrier/LogMovementForm.tsx`
- Rewrite: `app/src/app/restaurant/actions.ts` → client function
- Rewrite: `app/src/app/restaurant/ReceiveButton.tsx`

**Interfaces:**
- Consumes: `getProgramForWallet` (this task's own `program.ts` addition, used by all four rewritten action files); `roleFormArg`/`sourceTypeFormArg` (existing `format.ts`, unchanged); `newBatchId`/`hexToBatchId` (existing `batch-id.ts`, unchanged); `batchPda` (existing `program.ts`, unchanged).
- Produces: nothing new consumed by later tasks — this is the last task that touches page-level code before Task 5's script/cleanup pass.

- [ ] **Step 1: Add `getProgramForWallet` to `program.ts`**

In `app/src/lib/program.ts`, add after `getReadProgram`:
```ts
export function getProgramForWallet(
  wallet: Wallet,
  connection: Connection = getConnection(),
): Program<SupplyChainWeb3> {
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  return new Program(typedIdl(), provider);
}
```
Then simplify `getProgramForKeypair` to reuse it (same behavior, less duplication):
```ts
export function getProgramForKeypair(keypair: Keypair): Program<SupplyChainWeb3> {
  return getProgramForWallet(new KeypairWallet(keypair));
}
```
This has no automated test of its own (same reason as `getReadProgram`/`getProgramForKeypair` already have none — they need a live connection). `program.test.ts`'s existing PDA-derivation tests are unaffected; run them in Step 7 to confirm nothing broke.

- [ ] **Step 2: Rewrite the admin assign-role action + form**

Replace `app/src/app/admin/actions.ts` with:
```ts
"use client";

import { PublicKey } from "@solana/web3.js";

import { roleFormArg } from "@/lib/format";
import type { Wallet } from "@coral-xyz/anchor";
import { getProgramForWallet } from "@/lib/program";

export async function assignRole(
  wallet: Wallet,
  walletInput: string,
  role: "Source" | "Carrier" | "Restaurant",
): Promise<{ error: string | null }> {
  let target: PublicKey;
  try {
    target = new PublicKey(walletInput.trim());
  } catch {
    return { error: "That doesn't look like a valid Solana wallet address." };
  }

  const program = getProgramForWallet(wallet);
  try {
    // `config` and `roleAssignment` (seeds derived from the `wallet` arg
    // below) and `systemProgram` are all auto-resolved by the client.
    await program.methods
      .assignRole(target, roleFormArg(role) as never)
      .accounts({ admin: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to assign role." };
  }
  return { error: null };
}
```
Replace `app/src/app/admin/AssignRoleForm.tsx` with:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

import { assignRole } from "./actions";

export function AssignRoleForm() {
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }
    setPending(true);
    setError(null);
    const walletInput = String(formData.get("wallet") ?? "");
    const role = String(formData.get("role") ?? "") as "Source" | "Carrier" | "Restaurant";
    const result = await assignRole(wallet, walletInput, role);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <form action={handleSubmit}>
      <div className="field">
        <label htmlFor="wallet">Wallet address</label>
        <input
          id="wallet"
          name="wallet"
          className="mono"
          type="text"
          placeholder="9pL4...c22Z"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="role">Role</label>
        <select id="role" name="role" required defaultValue="Source">
          <option value="Source">Source</option>
          <option value="Carrier">Carrier</option>
          <option value="Restaurant">Restaurant</option>
        </select>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Assigning…" : "Assign role"}
      </button>
    </form>
  );
}
```
(`<form action={asyncFunction}>` with a plain client async function — not a Server Action — is supported by React 19's form actions; it receives the `FormData` the same way `useActionState`'s action did.)

- [ ] **Step 3: Rewrite the source register-batch action + form**

Replace `app/src/app/source/actions.ts` with:
```ts
"use client";

import BN from "bn.js";

import { newBatchId } from "@/lib/batch-id";
import { sourceTypeFormArg } from "@/lib/format";
import type { Wallet } from "@coral-xyz/anchor";
import { getProgramForWallet } from "@/lib/program";

const SOURCE_TYPES = ["Farmer", "Factory", "TraditionalMarket", "Supermarket"] as const;

export async function registerBatch(
  wallet: Wallet,
  ingredientName: string,
  quantityInput: string,
  sourceType: (typeof SOURCE_TYPES)[number],
): Promise<{ error: string | null }> {
  if (!ingredientName || ingredientName.length > 64) {
    return { error: "Ingredient name is required and must be 64 characters or fewer." };
  }
  if (!/^\d+$/.test(quantityInput)) {
    return { error: "Quantity must be a whole number." };
  }
  if (!SOURCE_TYPES.includes(sourceType)) {
    return { error: "Choose a source type." };
  }

  const program = getProgramForWallet(wallet);
  const batchIdBytes = newBatchId();

  try {
    // `roleAssignment` (seeds derived from `source` below), `batch` (seeds
    // derived from the `batchId` arg) and `systemProgram` are all
    // auto-resolved by the client.
    await program.methods
      .registerBatch(
        Array.from(batchIdBytes),
        ingredientName,
        new BN(quantityInput),
        sourceTypeFormArg(sourceType) as never,
      )
      .accounts({ source: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to register batch." };
  }
  return { error: null };
}
```
Replace `app/src/app/source/RegisterBatchForm.tsx` with:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

import { registerBatch } from "./actions";

export function RegisterBatchForm() {
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }
    setPending(true);
    setError(null);
    const ingredientName = String(formData.get("ingredientName") ?? "").trim();
    const quantity = String(formData.get("quantity") ?? "").trim();
    const sourceType = String(formData.get("sourceType") ?? "") as
      | "Farmer"
      | "Factory"
      | "TraditionalMarket"
      | "Supermarket";
    const result = await registerBatch(wallet, ingredientName, quantity, sourceType);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <form action={handleSubmit}>
      <div className="field">
        <label htmlFor="ingredientName">Ingredient name</label>
        <input
          id="ingredientName"
          name="ingredientName"
          type="text"
          maxLength={64}
          placeholder="e.g. Heirloom tomatoes"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="quantity">Quantity</label>
        <input id="quantity" name="quantity" type="number" min={0} step={1} placeholder="e.g. 240" required />
      </div>
      <div className="field">
        <label htmlFor="sourceType">Source type</label>
        <select id="sourceType" name="sourceType" required defaultValue="Farmer">
          <option value="Farmer">Farmer</option>
          <option value="Factory">Factory</option>
          <option value="TraditionalMarket">Traditional market</option>
          <option value="Supermarket">Supermarket</option>
        </select>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Registering…" : "Register batch"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Rewrite the carrier log-movement action + form**

Replace `app/src/app/carrier/actions.ts` with:
```ts
"use client";

import { hexToBatchId } from "@/lib/batch-id";
import type { Wallet } from "@coral-xyz/anchor";
import { batchPda, getProgramForWallet } from "@/lib/program";

export async function logMovement(
  wallet: Wallet,
  batchHex: string,
  isTransit: boolean,
  courierId: string,
  vehicleId: string,
  fromLocation: string,
  toLocation: string,
): Promise<{ error: string | null }> {
  let batchIdBytes: Uint8Array;
  try {
    batchIdBytes = hexToBatchId(batchHex);
  } catch {
    return { error: "Choose a batch." };
  }
  if (!fromLocation || fromLocation.length > 64 || !toLocation || toLocation.length > 64) {
    return { error: "From/to location are required and must be 64 characters or fewer." };
  }
  if (isTransit && (!courierId || !vehicleId)) {
    return { error: "Courier ID and vehicle ID are required for a transit stop." };
  }
  if (courierId.length > 32 || vehicleId.length > 32) {
    return { error: "Courier ID and vehicle ID must be 32 characters or fewer." };
  }

  const program = getProgramForWallet(wallet);
  const [batch] = batchPda(batchIdBytes);

  try {
    if (!(await program.account.batch.fetchNullable(batch))) {
      return { error: "That batch no longer exists." };
    }

    // `roleAssignment` (seeds derived from `carrier`) and `movement` (seeds
    // derived from `batch` and the batch's current `movementCount` field)
    // and `systemProgram` are all auto-resolved by the client — `batch`
    // itself isn't a PDA the client can derive (it has no `batchId` arg to
    // key off here), so it must be supplied explicitly.
    await program.methods
      .logMovement(isTransit ? courierId : null, isTransit ? vehicleId : null, fromLocation, toLocation)
      .accounts({ carrier: wallet.publicKey, batch })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to log movement." };
  }
  return { error: null };
}
```
Replace `app/src/app/carrier/LogMovementForm.tsx` with:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

import { logMovement } from "./actions";

export function LogMovementForm({ batches }: { batches: { value: string; label: string }[] }) {
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [stopType, setStopType] = useState<"transit" | "warehouse">("transit");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (formData: FormData) => {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }
    setPending(true);
    setError(null);
    const batchId = String(formData.get("batchId") ?? "");
    const isTransit = stopType === "transit";
    const courierId = String(formData.get("courierId") ?? "").trim();
    const vehicleId = String(formData.get("vehicleId") ?? "").trim();
    const fromLocation = String(formData.get("fromLocation") ?? "").trim();
    const toLocation = String(formData.get("toLocation") ?? "").trim();
    const result = await logMovement(wallet, batchId, isTransit, courierId, vehicleId, fromLocation, toLocation);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <form action={handleSubmit}>
      <div className="field">
        <label htmlFor="batchId">Batch</label>
        <select id="batchId" name="batchId" required>
          {batches.length === 0 ? (
            <option value="">No open batches</option>
          ) : (
            batches.map((batch) => (
              <option key={batch.value} value={batch.value}>
                {batch.label}
              </option>
            ))
          )}
        </select>
      </div>

      <label>Stop type</label>
      <div className="seg" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className={stopType === "transit" ? "active" : ""}
          onClick={() => setStopType("transit")}
        >
          Transit
        </button>
        <button
          type="button"
          className={stopType === "warehouse" ? "active" : ""}
          onClick={() => setStopType("warehouse")}
        >
          Warehouse stop
        </button>
      </div>
      <div className="section-sub" style={{ marginTop: -4 }}>
        Transit shows courier &amp; vehicle fields; warehouse stop hides them.
      </div>

      {stopType === "transit" ? (
        <>
          <div className="field">
            <label htmlFor="courierId">Courier ID</label>
            <input id="courierId" name="courierId" className="mono" type="text" maxLength={32} placeholder="CR-4471" required />
          </div>
          <div className="field">
            <label htmlFor="vehicleId">Vehicle ID</label>
            <input id="vehicleId" name="vehicleId" className="mono" type="text" maxLength={32} placeholder="VH-0092" required />
          </div>
        </>
      ) : null}

      <div className="field">
        <label htmlFor="fromLocation">From location</label>
        <input id="fromLocation" name="fromLocation" type="text" maxLength={64} placeholder="Green Valley Farm, CA" required />
      </div>
      <div className="field">
        <label htmlFor="toLocation">To location</label>
        <input id="toLocation" name="toLocation" type="text" maxLength={64} placeholder="Riverside Cold Storage, CA" required />
      </div>

      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending || batches.length === 0}>
        {pending ? "Logging…" : "Log movement"}
      </button>
    </form>
  );
}
```
(Dropped the old hidden `stopType` input — this version reads `stopType` from component state directly in `handleSubmit`, no need to round-trip it through `FormData`.)

- [ ] **Step 5: Rewrite the restaurant receive action + button**

Replace `app/src/app/restaurant/actions.ts` with:
```ts
"use client";

import { hexToBatchId } from "@/lib/batch-id";
import type { Wallet } from "@coral-xyz/anchor";
import { batchPda, getProgramForWallet } from "@/lib/program";

export async function receiveBatch(wallet: Wallet, batchHex: string): Promise<{ error: string | null }> {
  let batchIdBytes: Uint8Array;
  try {
    batchIdBytes = hexToBatchId(batchHex);
  } catch {
    return { error: "Invalid batch." };
  }

  const program = getProgramForWallet(wallet);
  const [batch] = batchPda(batchIdBytes);

  try {
    // `roleAssignment` (seeds derived from `restaurant`) is auto-resolved;
    // `batch` isn't a PDA the client can derive here, so it's explicit.
    await program.methods
      .receiveAtRestaurant()
      .accounts({ restaurant: wallet.publicKey, batch })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to receive batch." };
  }
  return { error: null };
}
```
Replace `app/src/app/restaurant/ReceiveButton.tsx` with:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

import { receiveBatch } from "./actions";

export function ReceiveButton({ batchIdHex }: { batchIdHex: string }) {
  const wallet = useAnchorWallet();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleClick = async () => {
    if (!wallet) {
      setError("Connect your wallet first.");
      return;
    }
    setPending(true);
    setError(null);
    const result = await receiveBatch(wallet, batchIdHex);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  return (
    <div style={{ display: "inline-block" }}>
      <button type="button" className="btn btn-primary" disabled={pending} onClick={handleClick}>
        {pending ? "Receiving…" : "Receive"}
      </button>
      {error ? <div className="field-error" style={{ marginTop: 6 }}>{error}</div> : null}
    </div>
  );
}
```

- [ ] **Step 6: Run the full test suite**

Run: `cd app && npm run test`
Expected: all 30 tests still pass, output pristine — none of this task's changes touch anything the vitest suite exercises (same reasoning as Task 2 Step 5: these are browser-wallet flows, verified manually next).

- [ ] **Step 7: Manual verification (full round trip)**

Prerequisite: `make validator` running, `make deploy`'d, `npm run provision` already run once (creates demo keypairs + `initialize_config`; at this point in the plan it still also assigns the three non-admin roles via script — Task 5 removes that half, so this is the last task where that still works end-to-end via the script path).

Run `make web`. Log in as Admin (demo button). On `/admin`, assign a *real* wallet (e.g. a second demo wallet's pubkey, or any localnet-funded keypair you have) a role via the form — confirm `router.refresh()` shows it took effect (no page reload, the batch table / state updates). Then:
- Log in as Source (demo button), register a batch, confirm it appears in "Batches you've registered."
- Log in as Carrier (demo button), log a movement against that batch (try both transit and warehouse-stop toggles), confirm it shows in "Movements you've logged" and the batch's status updates to `InTransit` on `/batch/[id]`.
- Log in as Restaurant (demo button), receive that batch, confirm status becomes `Delivered` on `/batch/[id]` with `receivedBy`/`deliveredAt` populated.

This is the plan's main integration test — there is no automated substitute for it in this project (see Global Constraints).

- [ ] **Step 8: Commit**

```bash
cd app && git add src/lib/program.ts \
  src/app/admin/actions.ts src/app/admin/AssignRoleForm.tsx \
  src/app/source/actions.ts src/app/source/RegisterBatchForm.tsx \
  src/app/carrier/actions.ts src/app/carrier/LogMovementForm.tsx \
  src/app/restaurant/actions.ts src/app/restaurant/ReceiveButton.tsx
git commit -m "feat: sign all mutating actions with the connected wallet, not a server key"
```

---

## Task 5: Provisioning script + demo-accounts cleanup

**Files:**
- Modify: `scripts/provision-demo-accounts.ts` (drop the `assign_role` loop)
- Modify: `app/src/lib/demo-accounts.ts` (drop `username`/`passwordHash`/`verifyPassword`/`findDemoAccount`/`loadKeypairForWallet`)
- Modify: `app/src/lib/demo-accounts.test.ts` (drop password/username tests)
- Modify: `app/package.json` (remove `bcryptjs` + `@types/bcryptjs` — no longer used anywhere after this task)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is the cleanup task, no later task depends on it.

- [ ] **Step 1: Confirm nothing else still references what's being removed**

Before touching code, grep to make sure Tasks 1-4 didn't leave a reference behind:
```bash
cd app && grep -rn "loadKeypairForWallet\|verifyPassword\|findDemoAccount\|passwordHash" src scripts
```
Expected: the only matches are inside `src/lib/demo-accounts.ts` itself (the definitions) and `src/lib/demo-accounts.test.ts` (the tests about to be removed/changed below). If anything else matches, stop and re-check Task 4's rewrites — this plan expects they fully replaced every caller.

- [ ] **Step 2: Update the provisioning script**

In `scripts/provision-demo-accounts.ts`, delete this entire block (it currently runs right after the `initializeConfig`/admin-matches `if/else if/else` chain, before the final `console.log("\nDemo accounts ready...`):
```ts
  for (const [role, keypair] of keypairs) {
    if (role === "Admin") continue;
    const [roleAddress] = roleAssignmentPda(keypair.publicKey);
    const existing = await adminProgram.account.roleAssignment.fetchNullable(roleAddress);
    if (existing && roleLabel(existing.role) === role) {
      console.log(`${role} already assigned to ${keypair.publicKey.toBase58()}`);
      continue;
    }
    // The enum arg's generated type (`DecodeEnum<...>`) is a deep conditional type that isn't practically nameable from a plain runtime string — `as never` is the pragmatic Anchor-client escape hatch here. `config`, `roleAssignment` (seeds = a const + the `wallet` arg above) and `systemProgram` are all auto-resolved by the client.
    await adminProgram.methods
      .assignRole(
        keypair.publicKey,
        roleFormArg(role as "Source" | "Carrier" | "Restaurant") as never,
      )
      .accounts({ admin: admin.publicKey })
      .rpc();
    console.log(`assigned ${role} to ${keypair.publicKey.toBase58()}`);
  }
```
Change the final logging block from:
```ts
  console.log("\nDemo accounts ready. Log in with (see src/lib/demo-accounts.ts for passwords):");
  for (const account of DEMO_ACCOUNTS) {
    console.log(`  ${account.username} (${account.role})`);
  }
```
to:
```ts
  console.log("\nDemo keypairs ready. Admin is on-chain; Source/Carrier/Restaurant still need");
  console.log("role assignments — log in as Admin and use the /admin page to assign each one:");
  for (const [role, keypair] of keypairs) {
    if (role === "Admin") continue;
    console.log(`  ${role.padEnd(10)} ${keypair.publicKey.toBase58()}`);
  }
```
`roleFormArg` and `roleLabel` imports from `"../src/lib/format"` become unused by this file after the deleted block — remove them from the `import { roleFormArg, roleLabel } from "../src/lib/format";` line. Check whether `roleAssignmentPda` (imported from `"../src/lib/program"`) is still used elsewhere in the file — it is not (the deleted block was its only use) — remove it from that import line too, leaving `configPda, getConnection, getProgramForKeypair`.

- [ ] **Step 3: Update `demo-accounts.test.ts`**

Replace `app/src/lib/demo-accounts.test.ts` with:
```ts
import { describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS } from "./demo-accounts";

describe("demo account roster", () => {
  it("exposes exactly the four PRD-required demo roles", () => {
    expect(DEMO_ACCOUNTS.map((account) => account.role).sort()).toEqual(
      ["Admin", "Carrier", "Restaurant", "Source"].sort(),
    );
  });

  it("gives each role a distinct key file", () => {
    const keyFiles = DEMO_ACCOUNTS.map((account) => account.keyFile);
    expect(new Set(keyFiles).size).toBe(keyFiles.length);
  });
});
```

- [ ] **Step 4: Run the test to verify it fails, then update `demo-accounts.ts`**

Run: `cd app && npm run test -- demo-accounts.test.ts`
Expected: FAIL — `DemoAccount` still has `username`/`passwordHash` required fields the test's `DEMO_ACCOUNTS` literal (defined in the source file itself, not the test) hasn't changed yet, so this actually won't fail on the test's own account — it fails because `demo-accounts.ts` is about to change shape and the old test (already replaced in Step 3) no longer matches. Proceed to the source change:

Replace `app/src/lib/demo-accounts.ts` with:
```ts
import { readFileSync } from "node:fs";
import path from "node:path";

import { Keypair } from "@solana/web3.js";

export type DemoRole = "Admin" | "Source" | "Carrier" | "Restaurant";

export type DemoAccount = {
  role: DemoRole;
  keyFile: string;
};

// Demo keypairs only — see prd/v3_wallet_auth.md "Demo wallets". These are
// NOT credentials: there's no password anymore. A wallet's actual
// authority comes from its on-chain RoleAssignment (or being Config.admin),
// checked at login via resolveRole — this list only maps a role label to
// which keypair file backs that role's demo button.
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
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app && npm run test -- demo-accounts.test.ts`
Expected: 2/2 passing.

- [ ] **Step 6: Remove the now-unused `bcryptjs` dependency**

In `app/package.json`, remove `"bcryptjs": "^3.0.3"` from `"dependencies"` and `"@types/bcryptjs": "^2.4.6"` from `"devDependencies"`. Run:
```bash
cd app && npm install
```
(This updates `package-lock.json` to drop the now-unreferenced package.)

- [ ] **Step 7: Run the full test suite**

Run: `cd app && npm run test`
Expected: 29 passing (30 from Task 4, minus one — `demo-accounts.test.ts` went from 3 tests to 2), output pristine.

- [ ] **Step 8: Manual verification (the real end-to-end story this plan is for)**

Prerequisite: fresh localnet state is cleanest here (`make validator` with `--reset`, redeploy, delete `.demo-keys/` and re-run `npm run provision` so Admin is freshly bootstrapped with no roles pre-assigned via script).

Run `make web`. Confirm:
1. `npm run provision` output now lists Source/Carrier/Restaurant pubkeys as needing assignment (per Step 2's new log message), and none of the three can log in yet (`resolveRole` returns `null` for them).
2. Log in as Admin (demo button). On `/admin`, assign each of the three demo pubkeys (printed by `provision`) to their matching role via the "Assign role" form.
3. Log out, log in as each of Source/Carrier/Restaurant (demo buttons) — all three now resolve correctly and land on their dashboard.
4. Repeat the full register → log movement → receive walk from Task 4 Step 7 once more, end to end, now with roles that only ever existed because the admin UI assigned them — not a script.

- [ ] **Step 9: Commit**

```bash
cd app && git add scripts/provision-demo-accounts.ts src/lib/demo-accounts.ts \
  src/lib/demo-accounts.test.ts package.json package-lock.json
git commit -m "chore: registration is admin-UI-only now; drop password/script-assignment code"
```
