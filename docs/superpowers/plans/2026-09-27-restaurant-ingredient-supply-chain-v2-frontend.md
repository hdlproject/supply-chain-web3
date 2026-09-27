# Restaurant Ingredient Supply Chain — v2 Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Note on this run:** this plan was executed inline by the same session that
> wrote it. The planning agent already held full context (program source,
> generated IDL, Anchor TS client conventions, the design canvas at
> `https://claude.ai/code/artifact/da0b3be1-9130-47c7-97a4-c64551887ba4`), so
> tasks below give exact interfaces and decisions rather than re-deriving them
> — implementers picking this up fresh should still be able to follow each
> task's Files/Interfaces/Steps independently.
>
> **Status: complete.** Tasks 1–12 landed in two commits (IDL/Makefile, then
> the full app). Task 13's live-validator walkthrough passed end to end —
> demo-login and manual-login, register → transit movement → warehouse-stop
> movement → receive, the batch detail timeline (courier/vehicle chips only
> on the transit entry), unauthenticated redirect, and wrong-role redirect
> — with zero server or browser-console errors. Two real bugs surfaced and
> were fixed along the way, not assumed away: `#[constant]` on the `usize`
> length constants broke `anchor idl build` (no `IdlBuild` impl for `usize`);
> `@coral-xyz/anchor`'s `Wallet` class is unusable under Turbopack (its ESM
> dist leaks CJS `exports.Wallet = require(...)` syntax) and was replaced
> with a small local `KeypairWallet`. Also discovered empirically (via the
> TS compiler, not assumed): Anchor's client auto-resolves any account whose
> PDA seeds are fully derivable from constants/args/already-supplied
> accounts — most `.accounts({...})` calls only pass the signer. The one
> step not exercised: reassigning a demo account's role mid-session from a
> *second* concurrent session, since a single browser profile's httpOnly
> session cookie can't hold two accounts' sessions at once — covered
> instead by the equivalent wrong-role-redirect check, which exercises the
> same guard code path.

**Goal:** Build the Next.js frontend described in `prd/v2_frontend.md` — login
(password + 4 demo buttons), one dashboard per role (Admin/Source/Carrier/
Restaurant), and a shared batch detail/monitoring page — talking to the
already-deployed Anchor program via a custodial, server-side-signing model.

**Architecture:** Next.js App Router project at `app/`, TypeScript, no
wallet-adapter. All chain interaction happens server-side: Server Components
read accounts with a read-only Anchor `Program`; Server Actions sign and
submit transactions using a demo account's keypair loaded from disk
server-side. A signed HttpOnly cookie carries only *identity* (username +
wallet); every protected page re-derives the account's *current* on-chain
role from the `RoleAssignment` PDA (or `Config.admin` for Admin) on each
load, per the PRD's "don't trust a cached role from login" requirement.

**Tech Stack:** Next.js 16 (App Router, TS, `src/` dir), React 19 Server
Actions (`useActionState`), `@coral-xyz/anchor` ^0.32, `@solana/web3.js` ^1.99,
`bcryptjs` for demo password hashes, `vitest` for unit tests, `next/font/google`
(IBM Plex Sans/Mono) for the design canvas's typography.

**Spec:** [prd/v2_frontend.md](../../../prd/v2_frontend.md); design reference:
the Design-type canvas at
`https://claude.ai/code/artifact/da0b3be1-9130-47c7-97a4-c64551887ba4`
(6 artboards: Login, Admin, Source, Carrier, Restaurant, Batch detail).

## Global Constraints

- Cluster defaults to localnet; `NEXT_PUBLIC_SOLANA_RPC_URL` and
  `NEXT_PUBLIC_PROGRAM_ID` env vars override it (PRD "Network configuration").
- No wallet-adapter, no production auth hardening, no sensor/anomaly
  monitoring, no role-revocation UI (PRD "Out of scope").
- `batch_id` is `[u8; 16]`; generate it client-side from a UUID's raw bytes,
  never ask the user to type one (PRD note under the mapping table).
- Every dashboard's available actions must reflect the account's **actual
  current on-chain role**, re-read on every page load — never trust a
  role cached at login time.
- `Role` (the on-chain enum) has exactly three variants — `Source`,
  `Carrier`, `Restaurant`. There is no `Admin` variant: admin-ness is
  `wallet == Config.admin`, not a `RoleAssignment` record. Every guard must
  handle this distinction explicitly.
- The on-chain IDL is snake_case (`assign_role`, `courier_id`, ...); the
  TS client auto-camelCases method/arg/account names
  (`assignRole`, `courierId`, ...) and enum variants lowercase only their
  first letter (`Role::TraditionalMarket` → `{ traditionalMarket: {} }`).
  Get this wrong and every `.methods.*` call silently fails to typecheck
  or resolve.
- `quantity` is a bare `u64` with no unit field in the account — the
  Source form takes a plain integer, not "240 kg"-style text (the design
  canvas's placeholder text was illustrative only, not literal schema).

---

## Prerequisite already resolved (see commit history, not a task here)

`anchor idl build` originally failed to compile: `#[constant]` was applied to
three `usize` constants (`MAX_INGREDIENT_NAME_LEN`, `MAX_LOCATION_LEN`,
`MAX_ID_LEN`) in `programs/supply-chain-web3/src/constants.rs`, and `usize`
has no `IdlBuild` impl (its width isn't portable). Fixed by dropping
`#[constant]` from those three (they're internal space/validation limits,
not part of the public interface) — behavior-neutral, `cargo test` still
shows 13/13 passing. `anchor idl build -o <path>.json -t <path>.ts` now
succeeds via plain `cargo test` compilation (host target, not
`cargo build-sbf`), sidestepping the litesvm/`.so` issue entirely since IDL
generation never touches the SBF `.so`.

---

### Task 1: Commit the generated IDL, add a Makefile target

**Files:**
- Create: `app/src/idl/supply_chain_web3.json`
- Create: `app/src/idl/supply_chain_web3.ts`
- Modify: `Makefile`

**Interfaces:**
- Produces: the on-disk IDL (snake_case, runtime source of truth for
  `new Program(idl, provider)`) and its camelCased TS type
  `SupplyChainWeb3`, used as `Program<SupplyChainWeb3>` everywhere in
  Task 4+.

- [ ] **Step 1:** `mkdir -p app/src/idl`
- [ ] **Step 2:** `anchor idl build -o app/src/idl/supply_chain_web3.json -t app/src/idl/supply_chain_web3.ts`
- [ ] **Step 3:** Add a Makefile target so this is reproducible:
  ```makefile
  idl:
  	mkdir -p app/src/idl
  	anchor idl build -o app/src/idl/supply_chain_web3.json -t app/src/idl/supply_chain_web3.ts
  ```
  Add `idl` to the `.PHONY` line and to `help`'s target list.
- [ ] **Step 4:** `make idl` and diff — should be byte-identical (or only
  differ in ignorable whitespace) to Step 2's output.
- [ ] **Step 5:** Commit `app/src/idl/*`, `Makefile`.

---

### Task 2: Scaffold the Next.js app and install dependencies

**Files:**
- Create: `app/package.json`, `app/tsconfig.json`, `app/next.config.ts`,
  `app/.gitignore`, `app/.env.local.example`, `app/vitest.config.ts`
- Modify: root `Makefile` (add a `web` target)

**Interfaces:**
- Produces: `app/` as an npm project with `dev`/`build`/`start`/`lint`/
  `test`/`provision` scripts; path alias `@/*` → `app/src/*`.

- [ ] **Step 1:** From repo root:
  ```bash
  npx create-next-app@latest app --typescript --app --src-dir --eslint --no-tailwind --import-alias "@/*" --use-npm
  ```
- [ ] **Step 2:**
  ```bash
  cd app && npm install @coral-xyz/anchor @solana/web3.js bcryptjs
  npm install -D vitest tsx @types/bcryptjs
  ```
- [ ] **Step 3:** Add to `app/package.json` `"scripts"`:
  ```json
  "test": "vitest run",
  "provision": "tsx scripts/provision-demo-accounts.ts"
  ```
- [ ] **Step 4:** Create `app/vitest.config.ts`:
  ```typescript
  import { defineConfig } from "vitest/config";
  import path from "node:path";

  export default defineConfig({
    resolve: {
      alias: { "@": path.resolve(__dirname, "./src") },
    },
    test: { environment: "node" },
  });
  ```
- [ ] **Step 5:** Create `app/.env.local.example`:
  ```
  NEXT_PUBLIC_SOLANA_RPC_URL=http://127.0.0.1:8899
  NEXT_PUBLIC_PROGRAM_ID=5k3AeBoUR2LsjXT8XtddP9VfcnztLQyiK5YgYscPtReX
  SESSION_SECRET=change-me-to-a-random-string
  ```
  Copy it to `app/.env.local` (gitignored) for local dev.
- [ ] **Step 6:** Append to `app/.gitignore`: `.demo-keys`
- [ ] **Step 7:** Add to root `Makefile`:
  ```makefile
  web:
  	cd app && npm run dev
  ```
  Add `web` to `.PHONY` and `help`.
- [ ] **Step 8:** `cd app && npm run build` — expect it to fail only on
  missing pages (none exist yet) or succeed trivially; this just proves
  the toolchain installs and runs. Commit `app/` (minus gitignored paths).

---

### Task 3: Global styling, layout shell, shared display components

**Files:**
- Create: `app/src/app/layout.tsx`, `app/src/app/globals.css`
- Create: `app/src/components/NavBar.tsx`, `app/src/components/RoleBadge.tsx`,
  `app/src/components/StatusBadge.tsx`

**Interfaces:**
- Produces: CSS classes consumed by every later page —
  `.page`, `.layout-split` (`.panel-narrow`/`.panel-wide`), `.card`,
  `.navbar`, `.field`/`.field-error`, `.btn`/`.btn-primary`/`.btn-outline`/
  `.btn-block`, `table`/`th`/`td`, `.badge-{registered,transit,delivered}`,
  `.seg`, `.timeline*`, `.chip`, `.login-*`, `.mono`.
  `<RoleBadge role={string} />`, `<StatusBadge status={EnumVariant} />`,
  `<NavBar role={string} wallet={PublicKey} />` (NavBar renders a sign-out
  form bound to `logoutAction` from Task 9 — stub that import until Task 9
  lands, or build Task 9's `logoutAction` first; simplest is to do Task 9's
  `app/src/app/login/actions.ts` `logoutAction` export as part of this task
  too, since NavBar can't compile without it).
- Consumes: nothing from earlier tasks.

- [ ] **Step 1:** Write `app/src/app/globals.css` with the palette/classes
  listed under Interfaces above (ink `#1c1b1a`, bg `#f4f3ef`, card `#fff`,
  border `#e4e2dc`, accent `#2a6f63`, clay `#c6742c` — same palette as the
  design canvas's artboards).
- [ ] **Step 2:** Write `app/src/app/layout.tsx` using
  `next/font/google`'s `IBM_Plex_Sans`/`IBM_Plex_Mono` as CSS variables
  `--font-sans`/`--font-mono`, imports `./globals.css`, sets
  `metadata = { title: "ChainTrace", description: "Restaurant Ingredient Supply Chain — v2 frontend" }`.
- [ ] **Step 3:** Write `app/src/lib/format.ts` (see Task 4 — pull its
  `roleLabel`/`batchStatusLabel`/`batchStatusSlug`/`shortWallet` forward
  into this task since `RoleBadge`/`StatusBadge`/`NavBar` need them; Task 4
  will add the rest of `format.ts` alongside it).
- [ ] **Step 4:** Write `RoleBadge.tsx`, `StatusBadge.tsx` as thin
  wrappers around `<span className="role-badge">`/`<span className={`badge badge-${slug}`}>`.
- [ ] **Step 5:** Write a minimal `app/src/app/login/actions.ts` with just
  `logoutAction` (`"use server"`; calls `destroySession()` from Task 6,
  then `redirect("/login")`) so `NavBar.tsx` has something real to import;
  Task 9 will fill in the rest of that file.
- [ ] **Step 6:** Write `NavBar.tsx`: renders brand, `<RoleBadge>`,
  `shortWallet(wallet)`, and a `<form action={logoutAction}>` sign-out
  button.
- [ ] **Step 7:** `cd app && npm run build` — expect success (no pages
  reference these yet, but they must compile standalone; add a throwaway
  `app/src/app/page.tsx` returning `<div>ok</div>` if the build complains
  about a missing root page, then let Task 10 replace it).
- [ ] **Step 8:** Commit.

---

### Task 4: On-chain client foundations — `program.ts`, `batch-id.ts`, `format.ts`

**Files:**
- Create: `app/src/lib/program.ts`, `app/src/lib/program.test.ts`
- Create: `app/src/lib/batch-id.ts`, `app/src/lib/batch-id.test.ts`
- Create: `app/src/lib/format.ts` (extends the stub from Task 3),
  `app/src/lib/format.test.ts`
- Create: `app/src/lib/action-state.ts`

**Interfaces:**
- Produces:
  - `getRpcUrl(): string`, `getProgramId(): PublicKey`,
    `getConnection(): Connection`
  - `getReadProgram(): Program<SupplyChainWeb3>` (read-only wallet, throws
    if a signature is attempted)
  - `getProgramForKeypair(keypair: Keypair): Program<SupplyChainWeb3>`
  - `configPda(programId?): [PublicKey, number]`
  - `roleAssignmentPda(wallet: PublicKey, programId?): [PublicKey, number]`
  - `batchPda(batchId: Uint8Array, programId?): [PublicKey, number]`
    (throws if `batchId.length !== 16`)
  - `movementPda(batch: PublicKey, movementCount: number, programId?): [PublicKey, number]`
  - `newBatchId(): Uint8Array` (16 bytes, from `crypto.randomUUID()`)
  - `batchIdToHex(bytes: Uint8Array): string`,
    `hexToBatchId(hex: string): Uint8Array`,
    `shortBatchId(hex: string): string`
  - `roleLabel`, `sourceTypeLabel`, `batchStatusLabel`,
    `batchStatusSlug(status): "registered"|"transit"|"delivered"`,
    `roleFormArg("Source"|"Carrier"|"Restaurant"): EnumVariant`,
    `sourceTypeFormArg("Farmer"|"Factory"|"TraditionalMarket"|"Supermarket"): EnumVariant`,
    `formatTimestamp(seconds: BN|number): string` (`0` → `"—"`),
    `shortWallet(pubkey: { toBase58(): string }): string`
  - `type ActionState = { error: string | null }`,
    `const initialActionState: ActionState`
- Consumes: nothing (pure + connection setup only).

- [ ] **Step 1:** Write `program.ts`. The runtime IDL JSON is snake_case;
  the generated `SupplyChainWeb3` TS type is camelCased — these shapes
  don't structurally match, so import the JSON and cast with
  `idlJson as unknown as SupplyChainWeb3` (documented inline: this is the
  standard Anchor client pattern, not a type-safety hole, since the JSON
  really is the program's IDL). PDA seed constants:
  `CONFIG_SEED = Buffer.from("config")`, `ROLE_SEED = Buffer.from("role")`,
  `BATCH_SEED = Buffer.from("batch")`, `MOVEMENT_SEED = Buffer.from("movement")`
  (must match `programs/supply-chain-web3/src/constants.rs` byte-for-byte).
  `movementPda` seed's count is 4 bytes little-endian
  (`Buffer.alloc(4).writeUInt32LE(movementCount, 0)`), matching
  `&batch.movement_count.to_le_bytes()` in `log_movement.rs`.
- [ ] **Step 2:** Write `program.test.ts` — assert each PDA function
  against an inline hand-derived `PublicKey.findProgramAddressSync` using
  the literal seed bytes and the real declared program id
  (`5k3AeBoUR2LsjXT8XtddP9VfcnztLQyiK5YgYscPtReX`); assert `batchPda`
  throws on a non-16-byte id; assert `roleAssignmentPda`/`movementPda`
  differ across distinct inputs.
- [ ] **Step 3:** `cd app && npx vitest run src/lib/program.test.ts` —
  expect all green.
- [ ] **Step 4:** Write `batch-id.ts`: `newBatchId` strips the dashes from
  `crypto.randomUUID()` and hex-decodes to 16 bytes; `batchIdToHex`/
  `hexToBatchId` round-trip; `shortBatchId(hex)` → `"8f21…07c9"` style.
- [ ] **Step 5:** Write `batch-id.test.ts` — round-trip a known 16-byte
  array ↔ its exact hex string; reject a non-32-char hex string; reject a
  non-16-byte array; two `newBatchId()` calls differ.
- [ ] **Step 6:** `npx vitest run src/lib/batch-id.test.ts` — green.
- [ ] **Step 7:** Finish `format.ts` (RoleBadge/StatusBadge from Task 3
  already use part of it): enum variant→label maps for `Role`,
  `SourceType` (note `traditionalMarket` → `"Traditional market"`),
  `BatchStatus`; `roleFormArg`/`sourceTypeFormArg` build the
  `{ variantName: {} }` shape the program's methods expect from a UI-level
  string like `"TraditionalMarket"`; `formatTimestamp` treats `0` as unset
  (`"—"`, matching `delivered_at: 0` before receipt).
- [ ] **Step 8:** Write `format.test.ts` — label every `Role`/`SourceType`
  variant incl. the multi-word one, `batchStatusSlug` maps all three
  statuses, `roleFormArg("Restaurant")` → `{ restaurant: {} }`,
  `sourceTypeFormArg("TraditionalMarket")` → `{ traditionalMarket: {} }`,
  `formatTimestamp(0)` → `"—"`, `formatTimestamp` of a real BN differs
  from `"—"`, `shortWallet` truncates correctly.
- [ ] **Step 9:** `npx vitest run src/lib/format.test.ts` — green.
- [ ] **Step 10:** Write `action-state.ts`:
  ```typescript
  export type ActionState = { error: string | null };
  export const initialActionState: ActionState = { error: null };
  ```
- [ ] **Step 11:** `npm run build` still succeeds. Commit.

---

### Task 5: Account fetch/decode helpers (`accounts.ts`)

**Files:**
- Create: `app/src/lib/accounts.ts`

**Interfaces:**
- Produces: `fetchConfig()`, `fetchRoleAssignment(wallet: PublicKey)`,
  `fetchBatch(batchIdBytes: Uint8Array)`, `fetchAllBatches()`,
  `fetchBatchesBySource(wallet: PublicKey)`, `fetchInTransitBatches()`,
  `fetchMovementsByCarrier(wallet: PublicKey)`,
  `fetchMovementsForBatch(batch: PublicKey)` (server-side memcmp filter on
  the `batch` field at offset 8, sorted by `timestamp` ascending), plus
  exported types `BatchEntry`, `MovementEntry`, `MovementRecord`,
  `BatchAccountDecoded` derived via `Awaited<ReturnType<...>>` /
  `NonNullable<...>` from the fetch functions above (consumed by
  components in Tasks 3, 10–13).
- Consumes: `getReadProgram`, `configPda`, `roleAssignmentPda`, `batchPda`
  from Task 4's `program.ts`.

- [ ] **Step 1:** Write `accounts.ts` per the Interfaces list. Every
  `fetch*` for a single account uses `.fetchNullable(pda)` (never
  `.fetch()`, which throws on a missing account — every guard/page needs
  to distinguish "doesn't exist yet" from a network error). List-shaped
  fetches (`fetchAllBatches`, `fetchBatchesBySource`,
  `fetchInTransitBatches`, `fetchMovementsByCarrier`) call
  `program.account.<x>.all()` and filter in JS — acceptable at demo scale,
  not optimized for a large validator. `fetchMovementsForBatch` is the one
  PRD explicitly calls out as needing a server-side filter
  ("`getProgramAccounts` filtered by the batch pubkey"), so it uses
  `program.account.movement.all([{ memcmp: { offset: 8, bytes: batch.toBase58() } }])`.
- [ ] **Step 2:** `npm run build` succeeds (no pages consume it yet, but
  it must typecheck standalone — add a temporary unused import check via
  `npx tsc --noEmit` if `next build` doesn't surface an error in a file
  nothing imports). Commit.

---

### Task 6: Auth foundations — demo accounts, session cookie, provisioning script

**Files:**
- Create: `app/src/lib/demo-accounts.ts`, `app/src/lib/demo-accounts.test.ts`
- Create: `app/src/lib/session.ts`, `app/src/lib/session.test.ts`
- Create: `app/src/lib/guard.ts`
- Create: `app/scripts/provision-demo-accounts.ts`

**Interfaces:**
- Produces:
  - `type DemoRole = "Admin"|"Source"|"Carrier"|"Restaurant"`
  - `type DemoAccount = { username, passwordHash, role: DemoRole, keyFile }`
  - `const DEMO_ACCOUNTS: DemoAccount[]` (exactly 4, one per role)
  - `findDemoAccount(username): DemoAccount | undefined`
  - `verifyPassword(account, password): boolean`
  - `demoKeysDir(): string` (env `DEMO_KEYS_DIR` or `<cwd>/.demo-keys`)
  - `loadKeypair(account: DemoAccount): Keypair` (throws with a
    "run npm run provision" hint if the key file is missing)
  - `loadKeypairForWallet(wallet: string): Keypair`
  - `roleHomePath(role: DemoRole): string` (`/admin`, `/source`,
    `/carrier`, `/restaurant`)
  - `SESSION_COOKIE = "scw_session"`,
    `type SessionPayload = { username, wallet, iat }`
  - `signSession(payload): string`, `verifySession(token): SessionPayload|null`
    (pure, HMAC-SHA256 over `SESSION_SECRET`, `timingSafeEqual` comparison)
  - `createSession(payload: Omit<SessionPayload,"iat">): Promise<void>`,
    `getSession(): Promise<SessionPayload|null>`,
    `destroySession(): Promise<void>` (cookie-store wrappers around the
    pure functions above)
  - `type AuthedSession = { username: string; wallet: PublicKey }`
  - `requireSession(): Promise<AuthedSession>` (redirects `/login` if none)
  - `requireAdmin(): Promise<AuthedSession>` (redirects unless
    `wallet == Config.admin`)
  - `requireRole(role: "Source"|"Carrier"|"Restaurant"): Promise<AuthedSession>`
    (redirects unless the wallet's `RoleAssignment.role` matches)
  - `resolveHomePath(wallet: PublicKey): Promise<string>` (Admin check
    first, then RoleAssignment, else `/login`)
- Consumes: `getReadProgram`, `configPda`, `roleAssignmentPda` (Task 4);
  `roleLabel` (Task 4).

- [ ] **Step 1:** Write `demo-accounts.ts`. Passwords are demo/dev-only,
  hardcoded and hashed with `bcryptjs` at module load
  (`admin`/`admin-demo-pass`, `source`/`source-demo-pass`,
  `carrier`/`carrier-demo-pass`, `restaurant`/`restaurant-demo-pass`) —
  intentionally simple per the PRD's "do not harden it as part of this
  v2". `loadKeypairForWallet` loops the 4 accounts, loading each keypair
  file and comparing `publicKey.toBase58()`.
- [ ] **Step 2:** Write `demo-accounts.test.ts` — exactly the 4 PRD roles
  are present; `findDemoAccount` finds/misses correctly; `verifyPassword`
  accepts the right password and rejects a wrong one (no filesystem
  needed for this test — password check is pure).
- [ ] **Step 3:** `npx vitest run src/lib/demo-accounts.test.ts` — green.
- [ ] **Step 4:** Write `session.ts` per Interfaces. `signSession` /
  `verifySession` are pure (base64url-encode a JSON payload, HMAC-sign,
  compare with `timingSafeEqual`); `createSession`/`getSession`/
  `destroySession` wrap them with `next/headers`'s `cookies()` (httpOnly,
  `sameSite: "lax"`, `secure` only in production, `maxAge` 8 hours).
- [ ] **Step 5:** Write `session.test.ts` — set `process.env.SESSION_SECRET`
  in `beforeAll`; round-trip a payload through `signSession`/
  `verifySession`; a tampered body (re-encoded with different content,
  same signature) fails verification; a malformed/empty token returns
  `null`.
- [ ] **Step 6:** `npx vitest run src/lib/session.test.ts` — green.
- [ ] **Step 7:** Write `guard.ts` per Interfaces — `requireAdmin` fetches
  `Config` via `configPda()` + `fetchNullable`, compares `.admin` to the
  session wallet; `requireRole` fetches `RoleAssignment` via
  `roleAssignmentPda(wallet)` + `fetchNullable`, compares
  `roleLabel(.role)` to the required role string; both redirect to
  `/login?error=unauthorized` on mismatch (this is the requirement that
  makes role changes take effect immediately, not just at login).
- [ ] **Step 8:** Write `scripts/provision-demo-accounts.ts` — a one-time
  setup script (not part of the running app):
  1. For each of the 4 demo roles: if `.demo-keys/<role>.json` is
     missing, `Keypair.generate()` and write
     `JSON.stringify(Array.from(keypair.secretKey))`; else load it.
  2. Airdrop 2 SOL to any keypair under 1 SOL balance
     (`connection.requestAirdrop` + `confirmTransaction`).
  3. Fetch `Config` via the admin keypair's read; if absent, call
     `initializeConfig()` with `{ admin, config, systemProgram }`; if
     present, assert `existingConfig.admin.equals(adminKeypair.publicKey)`
     or throw a clear mismatch error (this is the PRD's "the Admin demo
     account's keypair must be the same one that ran initialize_config").
  4. For Source/Carrier/Restaurant: if the wallet's `RoleAssignment`
     doesn't already have the right role, call
     `assignRole(walletPubkey, roleFormArg(role))` with
     `{ admin, config, roleAssignment, systemProgram }` — **`wallet` is an
     instruction *argument*, not an account** (don't put it in `.accounts()`).
  5. Log each demo account's pubkey and a reminder that passwords live in
     `demo-accounts.ts`.
- [ ] **Step 9:** `npm run build` succeeds. Commit (the script only
  *runs* against a live validator — Task 13 exercises it for real).

---

### Task 7: Login page (password form + 4 demo buttons)

**Files:**
- Modify: `app/src/app/login/actions.ts` (add `loginWithPassword`,
  `demoLoginAction`; `logoutAction` already exists from Task 3)
- Create: `app/src/app/login/LoginForm.tsx`
- Create: `app/src/app/login/page.tsx`
- Create: `app/src/app/page.tsx` (root — redirect to `/login` or the
  resolved role home)

**Interfaces:**
- Produces: `loginWithPassword(prev: ActionState, formData): Promise<ActionState>`,
  `demoLoginAction(role: DemoRole): Promise<never>` (bound per-button via
  `.bind(null, role)`, so the rendered `<form action={...}>` takes no
  client input).
- Consumes: `findDemoAccount`, `verifyPassword`, `loadKeypair`,
  `roleHomePath`, `DEMO_ACCOUNTS` (Task 6); `createSession`,
  `destroySession` (Task 6); `resolveHomePath` (Task 6);
  `ActionState`/`initialActionState` (Task 4).

- [ ] **Step 1:** Add `loginWithPassword` and `demoLoginAction` to
  `login/actions.ts`. Both: look up the demo account, `loadKeypair`,
  `createSession({ username, wallet: keypair.publicKey.toBase58() })`,
  `redirect(roleHomePath(account.role))`. `loginWithPassword` first
  checks `findDemoAccount(username)` and `verifyPassword`, returning
  `{ error: "Invalid username or password." }` on failure instead of
  redirecting.
- [ ] **Step 2:** Write `LoginForm.tsx` (client component): username +
  password fields, `useActionState(loginWithPassword, initialActionState)`,
  renders `state.error` in a `.field-error`, submit button disabled while
  `pending`.
- [ ] **Step 3:** Write `login/page.tsx` (server component): if
  `getSession()` already has a session, `redirect(await resolveHomePath(wallet))`
  immediately (don't show the login page to an already-authenticated
  user); otherwise render the brand header + two `.card`s side by side —
  left: `<LoginForm />`; right: one `<form action={demoLoginAction.bind(null, role)}>`
  per role with a `.btn-outline.btn-block` button, for all 4 roles.
- [ ] **Step 4:** Write root `app/src/app/page.tsx`: `getSession()` →
  redirect `/login` if none, else `redirect(await resolveHomePath(wallet))`.
- [ ] **Step 5:** `npm run build` succeeds; `npm run test` still all
  green. Commit.

*(Manual verification of the actual login flow needs the demo accounts
provisioned against a running validator — deferred to Task 13.)*

---

### Task 8: Admin dashboard

**Files:**
- Create: `app/src/app/admin/page.tsx`, `app/src/app/admin/actions.ts`,
  `app/src/app/admin/AssignRoleForm.tsx`
- Create: `app/src/components/BatchTable.tsx`

**Interfaces:**
- Produces: `<BatchTable batches={BatchEntry[]} showSource={boolean} />`
  (reused by Task 9's Source dashboard with `showSource={false}`),
  `assignRoleAction(prev: ActionState, formData): Promise<ActionState>`.
- Consumes: `requireAdmin` (Task 6), `fetchAllBatches` (Task 5),
  `loadKeypairForWallet` (Task 6), `configPda`/`roleAssignmentPda`/
  `getProgramForKeypair` (Task 4), `roleFormArg` (Task 4), `NavBar`
  (Task 3), `StatusBadge` (Task 3), `batchIdToHex`/`shortBatchId` (Task 4),
  `sourceTypeLabel` (Task 4).

- [ ] **Step 1:** Write `BatchTable.tsx`: renders an empty state
  (`.empty-state`, "No batches yet.") or a table with columns Batch ID
  (mono, `shortBatchId(batchIdToHex(...))`), Ingredient, Qty
  (`account.quantity.toString()`), Source type, optionally Registered-by
  (`showSource`), Status (`<StatusBadge>`), and a `Link` to
  `/batch/${hexId}`.
- [ ] **Step 2:** Write `admin/actions.ts`'s `assignRoleAction`: parse
  `wallet` (validate with `new PublicKey(...)`, catch → error message)
  and `role` from `FormData`; `requireAdmin()` for the acting session;
  `loadKeypairForWallet(session.wallet.toBase58())`; call
  `.methods.assignRole(walletPubkey, roleFormArg(role)).accounts({ admin, config, roleAssignment, systemProgram: SystemProgram.programId }).rpc()`
  wrapped in try/catch returning `{ error: error.message }`; on success
  `revalidatePath("/admin")` and return `{ error: null }`.
- [ ] **Step 3:** Write `AssignRoleForm.tsx` (client): wallet text input
  (mono), role `<select>` (Source/Carrier/Restaurant),
  `useActionState(assignRoleAction, initialActionState)`.
- [ ] **Step 4:** Write `admin/page.tsx`: `requireAdmin()`,
  `fetchAllBatches()`, render `<NavBar role="Admin">`, a
  `.layout-split` with `.panel-narrow` (`<AssignRoleForm>`) and
  `.panel-wide` (`<BatchTable batches={batches} showSource />`).
- [ ] **Step 5:** `npm run build`. Commit.

---

### Task 9: Source dashboard

**Files:**
- Create: `app/src/app/source/page.tsx`, `app/src/app/source/actions.ts`,
  `app/src/app/source/RegisterBatchForm.tsx`

**Interfaces:**
- Produces: `registerBatchAction(prev: ActionState, formData): Promise<ActionState>`.
- Consumes: `requireRole("Source")` (Task 6), `fetchBatchesBySource`
  (Task 5), `newBatchId`/`batchPda` (Task 4), `sourceTypeFormArg` (Task 4),
  `loadKeypairForWallet` (Task 6), `BatchTable` (Task 8).

- [ ] **Step 1:** Write `registerBatchAction`: validate `ingredientName`
  (non-empty, ≤64 chars — matches `MAX_INGREDIENT_NAME_LEN`), `quantity`
  (`/^\d+$/`, wrapped in `new BN(...)`), `sourceType` (one of the 4
  literal strings); `requireRole("Source")`; `newBatchId()` +
  `batchPda(bytes)`; call
  `.methods.registerBatch(Array.from(batchIdBytes), ingredientName, new BN(quantity), sourceTypeFormArg(sourceType)).accounts({ source, roleAssignment, batch, systemProgram: SystemProgram.programId }).rpc()`;
  `revalidatePath("/source")` on success.
- [ ] **Step 2:** Write `RegisterBatchForm.tsx` (client): ingredient name
  text input (`maxLength={64}`), quantity `type="number" min={0} step={1}`
  (no unit — see Global Constraints), source type `<select>` with the 4
  options (label "Traditional market" for the `TraditionalMarket` value).
- [ ] **Step 3:** Write `source/page.tsx`: `requireRole("Source")`,
  `fetchBatchesBySource(session.wallet)`, `<NavBar role="Source">`,
  `.layout-split` with the form (narrow) and
  `<BatchTable batches={batches} showSource={false} />` (wide).
- [ ] **Step 4:** `npm run build`. Commit.

---

### Task 10: Carrier dashboard

**Files:**
- Create: `app/src/app/carrier/page.tsx`, `app/src/app/carrier/actions.ts`,
  `app/src/app/carrier/LogMovementForm.tsx`

**Interfaces:**
- Produces: `logMovementAction(prev: ActionState, formData): Promise<ActionState>`.
- Consumes: `requireRole("Carrier")` (Task 6), `fetchAllBatches`/
  `fetchMovementsByCarrier` (Task 5), `hexToBatchId` (Task 4),
  `batchPda`/`movementPda`/`getProgramForKeypair`/`roleAssignmentPda`
  (Task 4), `loadKeypairForWallet` (Task 6).

- [ ] **Step 1:** Write `logMovementAction`: parse `batchId` (hex, via
  `hexToBatchId`, catch → "Choose a batch."), `stopType`
  (`"transit"|"warehouse"`), `courierId`/`vehicleId`/`fromLocation`/
  `toLocation`; validate `fromLocation`/`toLocation` non-empty ≤64 chars;
  if `stopType === "transit"`, require both `courierId` and `vehicleId`
  non-empty ≤32 chars, else pass `null` for both (mirrors the on-chain
  `courier_id.is_some() == vehicle_id.is_some()` check in
  `log_movement.rs` — both-or-neither); `requireRole("Carrier")`;
  **fetch the batch first** (`program.account.batch.fetch(batchPda)`) to
  read its current `movementCount`, then `movementPda(batch, movementCount)`
  — the on-chain seed is the count *at the moment the instruction runs*,
  so a stale read here just makes the `rpc()` call fail (acceptable for a
  single-user demo, not building retry/optimistic-concurrency logic); call
  `.methods.logMovement(courierId, vehicleId, fromLocation, toLocation).accounts({ carrier, roleAssignment, batch, movement, systemProgram: SystemProgram.programId }).rpc()`;
  `revalidatePath("/carrier")` on success.
- [ ] **Step 2:** Write `LogMovementForm.tsx` (client): batch `<select>`
  populated from a `{ value: hexId, label }[]` prop; a `.seg` two-button
  toggle (`useState<"transit"|"warehouse">`) mirrored into a hidden
  `stopType` input; courier/vehicle fields render only when
  `stopType === "transit"` (both `required` in that branch); from/to
  location text inputs (`maxLength={64}`).
- [ ] **Step 3:** Write `carrier/page.tsx`: `requireRole("Carrier")`;
  fetch `fetchAllBatches()` and `fetchMovementsByCarrier(wallet)` in
  parallel; build the batch-selector options by filtering out batches
  whose `status` has `"delivered"` (`!("delivered" in account.status)`);
  render `<NavBar role="Carrier">`, `.layout-split` with
  `<LogMovementForm>` (narrow) and a simple timeline of this carrier's
  own logged movements, newest first (wide).
- [ ] **Step 4:** `npm run build`. Commit.

---

### Task 11: Restaurant dashboard

**Files:**
- Create: `app/src/app/restaurant/page.tsx`,
  `app/src/app/restaurant/actions.ts`,
  `app/src/app/restaurant/ReceiveButton.tsx`

**Interfaces:**
- Produces: `receiveAction(prev: ActionState, formData): Promise<ActionState>`,
  `<ReceiveButton batchIdHex={string} />`.
- Consumes: `requireRole("Restaurant")` (Task 6), `fetchInTransitBatches`
  (Task 5), `hexToBatchId`/`batchPda` (Task 4), `roleAssignmentPda`/
  `getProgramForKeypair` (Task 4), `loadKeypairForWallet` (Task 6).

- [ ] **Step 1:** Write `receiveAction`: parse `batchId` (hex); `requireRole("Restaurant")`;
  call `.methods.receiveAtRestaurant().accounts({ restaurant, roleAssignment, batch }).rpc()`
  (no `systemProgram` — this instruction has no `init`); `revalidatePath("/restaurant")`
  on success.
- [ ] **Step 2:** Write `ReceiveButton.tsx` (client): a one-field form
  (`hidden` `batchId` input) with `useActionState(receiveAction, initialActionState)`,
  submit button reads "Receive"/"Receiving…", shows `state.error` inline.
- [ ] **Step 3:** Write `restaurant/page.tsx`: `requireRole("Restaurant")`,
  `fetchInTransitBatches()`, `<NavBar role="Restaurant">`, a single
  `.card` with a table (or `.empty-state` "Nothing awaiting receipt right
  now.") — columns Batch ID, Ingredient, Qty, Status, and a
  `<ReceiveButton>` per row.
- [ ] **Step 4:** `npm run build`. Commit.

---

### Task 12: Batch detail page

**Files:**
- Create: `app/src/app/batch/[id]/page.tsx`
- Create: `app/src/components/MovementTimeline.tsx`

**Interfaces:**
- Produces: `<MovementTimeline movements={MovementRecord[]} batch={BatchAccountDecoded} />`
  — first timeline entry is synthesized from `batch.source`/
  `batch.sourceType`/`batch.createdAt` (**the `Batch` account has no
  location field** — don't invent one; the design canvas's "Sunrise
  Poultry Factory, CA" first-entry text was illustrative, not schema-
  accurate), remaining entries from `movements` (`fromLocation → toLocation`,
  courier/vehicle chips only when both are non-null, `formatTimestamp`).
- Consumes: `requireSession` (Task 6, not role-gated — "available
  regardless of logged-in role" per PRD, but still requires being
  authenticated), `fetchBatch`/`fetchMovementsForBatch` (Task 5),
  `hexToBatchId`/`shortBatchId`/`batchPda` (Task 4), `sourceTypeLabel`/
  `shortWallet`/`formatTimestamp` (Task 4), `StatusBadge` (Task 3).

- [ ] **Step 1:** Write `MovementTimeline.tsx` per Interfaces above.
- [ ] **Step 2:** Write `batch/[id]/page.tsx` (Next.js 15+ dynamic APIs:
  `params` is a `Promise<{ id: string }>`, `await` it): `requireSession()`;
  `hexToBatchId(id)` in a try/catch → `notFound()` on a malformed id;
  `fetchBatch(bytes)` → `notFound()` if null; `batchPda(bytes)` to get the
  batch's own pubkey, then `fetchMovementsForBatch(batchAddress)`; render
  a batch-only navbar (brand + "← Back to dashboard" linking to `/`, not
  the full `<NavBar>` since this page isn't role-specific), a
  `.layout-split` with a narrow column (batch id/ingredient/status card,
  then a fields grid: quantity, source type, registered-by, registered-at,
  and — only when `!batch.receivedBy.equals(PublicKey.default)` —
  received-by/delivered-at) and a wide `.card` with `<MovementTimeline>`.
- [ ] **Step 3:** `npm run build`. Commit.

---

### Task 13: End-to-end verification against a real localnet

Not a code task — this is the point where the demo/custodial auth model,
the provisioning script, and every dashboard get exercised against an
actual running validator + deployed program, which nothing before this
point could do without one.

- [ ] **Step 1:** `make validator` (background), wait for it to be up.
- [ ] **Step 2:** `make deploy` (builds via `cargo build-sbf` and
  `anchor deploy`s to localnet).
- [ ] **Step 3:** `cd app && cp .env.local.example .env.local` (edit
  `SESSION_SECRET` to something random), `npm run provision` — expect
  it to print all 4 demo pubkeys, initialize `Config`, and assign
  Source/Carrier/Restaurant roles with no errors.
- [ ] **Step 4:** `npm run provision` again — expect it to report
  "already initialized"/"already assigned" for everything (idempotency
  check).
- [ ] **Step 5:** `npm run dev`; open the app.
- [ ] **Step 6:** Click "Demo login as Admin" → lands on `/admin`; assign
  a throwaway keypair (generate one with `solana-keygen new` to a temp
  file, or reuse one of the other demo pubkeys) a role; confirm it
  appears without error and the batches table renders (empty initially).
- [ ] **Step 7:** Sign out, "Demo login as Source" → register a batch;
  confirm it appears in "Batches you've registered" and its `/batch/[id]`
  page shows Registered status with no movements yet.
- [ ] **Step 8:** Sign out, "Demo login as Carrier" → log a transit
  movement on that batch (courier/vehicle fields visible); confirm the
  batch detail page now shows In transit status and one timeline entry.
  Log a warehouse-stop movement on the same batch (toggle to "Warehouse
  stop", confirm courier/vehicle fields disappear and aren't required);
  confirm the batch detail page shows two timeline entries, the second
  with no courier/vehicle chips.
- [ ] **Step 9:** Sign out, "Demo login as Restaurant" → confirm the
  batch appears in "Awaiting receipt"; click Receive; confirm it
  disappears from the list and `/batch/[id]` now shows Delivered status
  plus received-by/delivered-at fields.
- [ ] **Step 10:** As Admin, reassign the Carrier demo wallet's role to
  Restaurant, then load `/carrier` while still signed in as that
  account — confirm it redirects to `/login?error=unauthorized` (proves
  the "actual current on-chain role, not cached" requirement). Reassign
  it back to Carrier afterward so the demo accounts are left in their
  expected state.
- [ ] **Step 11:** `cd app && npm run test` — full unit suite green.
- [ ] **Step 12:** `cd /Users/hendradanulaksana/Documents/supply-chain-web3 && cargo test`
  — confirm the Rust program's own 13/13 still pass (this plan never
  touches program logic after the Task 1 prerequisite fix, but this is a
  cheap final check).

---

## Execution Notes

Tasks 1–12 build in dependency order (each's Interfaces section only
consumes what an earlier task produced); Task 13 is the first point any
of it touches a live chain. If resuming this plan later, re-run
`make validator && make deploy && npm run provision` before Task 13's
steps — none of that state persists across a validator restart.
