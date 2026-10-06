# Restaurant Ingredient Supply Chain — v3 Wallet Authentication

## Context

v2 ([prd/v2_frontend.md](v2_frontend.md)) built the frontend on a deliberate
demo auth model: username/password login, four pre-provisioned demo
accounts, and a **custodial** signing model — the app itself held every
account's private key (`.demo-keys/*.json`) and signed on-chain
transactions server-side on the user's behalf. Real wallet-adapter
integration was explicitly marked out of scope at the time.

v3 reverses that specific decision: this spec replaces
username/password with real wallet-signature authentication, moves
transaction signing to the connected wallet (no more server-held keys
for actions), and makes the on-chain `RoleAssignment` the sole source of
truth for who can log in and as what role — there is no other "user
registry" in the app. Registration (assigning a role to a new wallet)
happens exclusively through the admin UI calling `assign_role`, not
through a script or a hardcoded account list.

Everything else from v1/v2 — the five on-chain instructions, the four
roles, the per-role routes, the batch-monitoring view — is unchanged.
This spec only replaces *how a session gets established* and *who signs
what*.

## Login flow (Sign-In With Solana pattern)

Replaces username/password entirely. No passwords exist anywhere in v3.

1. `GET /login` generates a random nonce (server-side, short-lived — a
   few minutes) and embeds it in the page for the client to sign.
2. User connects a wallet — a real extension (Phantom/Solflare/etc. via
   `@solana/wallet-adapter-react`) or a "Demo <Role>" button (see "Demo
   wallets" below) — and the page calls `wallet.signMessage(nonceBytes)`.
3. Client POSTs `{ pubkey, signature, nonce }` to a login endpoint.
4. Server verifies:
   - the signature is valid for the claimed `pubkey` over the exact nonce
     bytes (`nacl.sign.detached.verify`, via `tweetnacl` — already a
     transitive dependency of `@solana/web3.js`)
   - the nonce is the one just issued and hasn't already been consumed
     (anti-replay — a nonce is single-use and expires)
5. If the signature checks out, the server does a **read-only on-chain
   lookup**: fetch the `RoleAssignment` PDA for `pubkey`.
   - **Found** → create a session `{ wallet: pubkey, role, iat }` (role
     read from the fetched account, not from any app-side list) and
     redirect to that role's home route (`roleHomePath`, unchanged from
     v2).
   - **Not found** → reject with a clear message: this wallet has no
     on-chain role assignment; an admin must register it first. No
     session is created.

The session cookie's sign/verify mechanism (`session.ts`'s HMAC
signing, `SESSION_SECRET`) is unchanged structurally — only what
establishes the session changes. One deliberate tradeoff, stated
explicitly: `role` is cached in the session at login time, not
re-verified against the chain on every subsequent request. If an
admin changes or revokes a wallet's role mid-session, that wallet's
existing session keeps acting on the stale role until it logs in again.
Out of scope for v3 to fix (would need either short session lifetimes or
a per-request on-chain check); flagged here as a known limitation.

## Action signing moves to the connected wallet

Every mutating instruction call — `assign_role`, `register_batch`,
`log_movement`, `receive_at_restaurant` — moves from a Next.js Server
Action signing with a server-held keypair, to fully client-side:

- Build the Anchor instruction in the browser using the Anchor TS client
  and the connected wallet (`useAnchorWallet()` / equivalent from
  `wallet-adapter-react`).
- Call `wallet.sendTransaction(...)` (or `program.methods....rpc()` with
  the wallet as the provider) so the **connected wallet itself** signs —
  real extension or demo adapter, same code path either way.
- Submit directly to the configured RPC endpoint (`NEXT_PUBLIC_SOLANA_RPC_URL`,
  unchanged from v2).

No Server Action reads a private key off disk to sign a transaction on a
user's behalf, for any instruction, after this change.

## Demo wallets (the demo buttons stay, but become real signers)

Since nothing server-side signs on anyone's behalf anymore, each "Demo
<Role>" button needs to activate a genuine signer in the browser, not
just stamp a session cookie.

- A small custom wallet-adapter `Wallet` implementation, backed by an
  in-memory `Keypair`, is constructed client-side when a demo button is
  clicked. It implements `signMessage` and `signTransaction` the same
  way a real wallet-adapter wallet does — the rest of the app's code
  (login flow, action-signing flow) doesn't need to know the difference
  between this and a real extension.
- The secret key bytes needed to construct that in-memory `Keypair` are
  fetched from a dedicated server route, e.g. `GET
  /api/demo-keypair?role=Source`, rather than being baked into the
  client JS bundle.
- That route **must** be gated: only responds when running against
  localnet (check the configured RPC/cluster) **and** a
  `NEXT_PUBLIC_ENABLE_DEMO_WALLETS` flag is set. Returns 404/disabled
  otherwise. This is a hard requirement, not a nice-to-have — it's the
  one thing standing between "convenient localnet demo" and "anyone can
  download a real private key from a public deploy."
- Once the bytes reach the browser, custody is entirely client-side for
  that session, same as a real wallet — the server has no further
  involvement in signing.

## Registration: admin UI only, nothing else

`scripts/provision-demo-accounts.ts` shrinks to exactly two
responsibilities, both of which are genuine one-time bootstrap steps
that can't happen through the UI (nobody can log in as admin before
either exists):
1. Generate and fund the four demo keypairs (Admin/Source/Carrier/Restaurant),
   writing them wherever the demo-keypair route (above) reads them from.
2. Call `initialize_config` **once**, with the Admin demo keypair as the
   signer — this is what makes that keypair *the* on-chain admin.

It **no longer** calls `assign_role` for Source/Carrier/Restaurant. After
running it, the only way any of those three demo wallets gets a role is
the real intended flow: log in as Admin (demo button or a real wallet
matching `Config.admin`), open `/admin`, and use the existing "Assign
Role" form — which now submits via the client-side signing flow above —
to assign each one. This is deliberate: it means the admin flow gets
exercised for real even when setting up the demo environment, rather
than being bypassed by a script.

There is no other registration path. A wallet with no `RoleAssignment`
simply cannot log in, demo or otherwise, until an admin assigns it one.

## What gets removed from v2

- `demo-accounts.ts`: `username`, `passwordHash`, `verifyPassword`,
  `loadKeypair`, `loadKeypairForWallet` all go away — no passwords, no
  server-held signing keys for actions. What's left: the four demo
  wallets' public keys/role labels (for displaying "Demo <Role>" buttons)
  and whatever the demo-keypair route needs to look up the right secret.
- `login/actions.ts`'s password-checking branch (`loginWithPassword`)
  goes away, replaced by the nonce/signature verification flow above.
- `session.ts`'s payload shape changes: `username` is dropped (or kept
  purely as an optional display label, no longer an identity field);
  `role` is added, sourced from the chain at login time as described
  above.

## Out of scope for v3

- Re-verifying a session's role against the chain on every request
  (noted as a known limitation above, not fixed here).
- Any UI for role revocation or admin transfer — still not supported by
  the on-chain program (same gap noted in v1/v2).
- Supporting any wallet-adapter wallet beyond whatever ships by default
  with `@solana/wallet-adapter-wallets` plus the custom demo adapter —
  no bespoke wallet integrations.
