# Restaurant Ingredient Supply Chain — v2 Frontend

## Context

v1 ([prd/v1_basic_functionality.md](v1_basic_functionality.md)) built the on-chain Anchor
program: five instructions (`initialize_config`, `assign_role`, `register_batch`,
`log_movement`, `receive_at_restaurant`) over four PDA account types
(`Config`, `RoleAssignment`, `Batch`, `Movement`), already implemented,
tested (13/13 passing), and merged.

v2 scope: a web frontend that lets a human perform every one of those
on-chain actions and read the monitoring data (status + movement history)
through a browser, instead of hand-crafting Solana CLI transactions.

## Users & authentication (demo model — read this section first)

This is a **demo/dev authentication model**, not production wallet
authentication. Deliberate simplification, not an oversight — do not
harden it as part of this v2.

- Login is **username + password**, not a wallet-connect flow
  (Phantom/Solflare etc.). Each app account maps 1:1 to a Solana keypair
  the app itself holds and signs with on the user's behalf (custodial, for
  demo purposes only).
- Four demo accounts are pre-provisioned, one per on-chain role — Admin,
  Source, Carrier, Restaurant — each already `assign_role`'d to its role
  on-chain before the app is used. The Admin demo account's keypair must
  be the same one that ran `initialize_config` (the program's configured
  admin).
- The login page shows a **"Demo login as <Role>"** button per role,
  alongside the username/password form — one click, instantly
  authenticated as that role's pre-provisioned account, no typing
  credentials.
- Real wallet-adapter integration is explicitly out of scope for v2 (see
  Out of Scope).

## Roles & routes

- `/login` — username/password form + 4 demo-login buttons.
- `/admin` — assign/change a wallet's role (form: wallet address + role
  dropdown: Source/Carrier/Restaurant); view all batches and their full
  movement history (monitoring, admin-wide view).
- `/source` — register a new batch (ingredient name, quantity, source
  type dropdown: Farmer/Factory/TraditionalMarket/Supermarket); list of
  batches this account has registered.
- `/carrier` — log a movement: batch selector, a transit/warehouse-stop
  toggle that shows or hides the courier_id/vehicle_id fields
  accordingly, from/to location fields; list of movements this account
  has logged.
- `/restaurant` — list of batches currently `InTransit` awaiting receipt,
  with a "Receive" action per batch.
- `/batch/[id]` — shared batch detail view, available regardless of
  logged-in role: current status, all `Batch` fields, and the full
  movement timeline (ordered from→to edges with courier/vehicle/timestamp
  where present). This is the v1 spec's "Monitoring" feature surfaced as
  UI.

Each dashboard's available actions must reflect the account's **actual
current on-chain role** (read the `RoleAssignment` account), not just
"whichever demo button was clicked" — if an admin changes a demo
account's role on-chain mid-session, the UI should reflect that on next
load, not trust a cached role from login.

## Core interactions → on-chain mapping

| UI action | Instruction / read |
|---|---|
| Admin: submit "Assign Role" form | `assign_role(wallet, role)` |
| Source: submit "Register Batch" form | `register_batch(batch_id, ingredient_name, quantity, source_type)` |
| Carrier: submit "Log Movement" form | `log_movement(courier_id, vehicle_id, from_location, to_location)` |
| Restaurant: click "Receive" | `receive_at_restaurant()` |
| Any batch detail page load | Read `Batch` account directly; `getProgramAccounts` filtered by the batch pubkey for `Movement` history |

Note for the "Register Batch" form: `batch_id` is `[u8; 16]` on-chain, not
a plain string — generate it client-side (e.g. a UUID's raw bytes) rather
than asking the user to type one.

## Network configuration

- Default cluster: **localnet** — matches this repo's `Anchor.toml`
  (`provider.cluster = "localnet"`) and the `Makefile`'s
  `validator`/`deploy` targets.
- Must be runtime/build-time configurable (e.g. `NEXT_PUBLIC_SOLANA_RPC_URL`
  + `NEXT_PUBLIC_PROGRAM_ID` env vars) so the same app can later point at
  devnet or mainnet without a code change.

## Tech stack

- **Next.js + React.**
- Anchor TypeScript client, generated from the program's IDL.
- **Open prerequisite — not yet resolved, flagging so it isn't assumed
  solved:** no IDL has ever been generated for this program (`target/idl/`
  doesn't exist). This repo's verified build recipe
  (`cargo build-sbf --tools-version v2.3.2`, documented in
  `docs/superpowers/plans/2026-09-19-restaurant-ingredient-supply-chain-v1.md`)
  bypasses `anchor build`, which is what normally emits the IDL, because
  plain `anchor build` produces a `.so` that this environment's litesvm
  rejects. `programs/supply-chain-web3/Cargo.toml` already declares an
  `idl-build` feature (`idl-build = ["anchor-lang/idl-build"]`) meant for
  generating the IDL via a separate, non-SBF compilation path — untested
  here. Whoever builds this frontend needs to get IDL generation working
  first before a typed client exists to build against.

## Out of scope for v2

- Real wallet-adapter (Phantom/Solflare/etc.) integration — deferred; the
  username/password + demo-login model above is intentional for now.
- Production auth hardening / non-custodial key management.
- Sensor/condition monitoring, anomaly alerts — already out of scope on
  the backend (v1 PRD), still out of scope here.
- Role revocation / admin-transfer UI — not supported by the on-chain
  program yet (parked as a known gap in v1's implementation history).
