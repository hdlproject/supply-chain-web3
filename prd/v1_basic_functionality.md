# Restaurant Ingredient Supply Chain — v1

## Context

Original ask: "I wanna create a supply chain system, including monitoring,
etc, but I don't know where to start." Through brainstorming, the concrete
domain was established: a restaurant sources ingredients from multiple
supplier types (farmer, factory, traditional market, supermarket). A batch
of ingredients travels through zero or more transit legs and warehouse
stops before arriving at the restaurant's own inventory system, which is
out of scope (external system, not part of this program).

v1 scope: an Anchor (Solana) program that lets authorized parties register
an ingredient batch, log each movement (transit leg or warehouse stop) it
passes through, and mark it received at the restaurant. Monitoring for v1
means: query current status of a batch, and query its full movement
history — both readable directly from on-chain accounts, no off-chain
indexer required.

Out of scope for v1: sensor/condition monitoring (temperature etc),
alerts/anomaly detection, the restaurant's internal inventory system
itself (only the handoff boundary into it), multi-step approval workflows,
and any UI/client (this spec covers the on-chain program only).

## Existing project state

Anchor workspace `supply-chain-web3`, currently containing only the
default Anchor counter template (`Counter` account, `initialize` /
`increment` instructions, one litesvm-based integration test). This
template is replaced entirely by the design below — none of the counter
code is domain-relevant and none of it is kept.

Test harness: Rust integration tests using `litesvm`, loading the built
`.so` and driving instructions directly (see existing
`tests/test_initialize.rs`). The new tests follow the same pattern.

## Roles & access control

A single **admin** authority (the wallet that runs `initialize_config`)
governs who may act in each role. There is no self-registration — this
was chosen explicitly over a self-declared-role model, since restaurant
supply chains need the restaurant (or its operator) to control who is
trusted as a source, carrier, or receiver.

- `Config` — singleton PDA, seed `[b"config"]`. Fields: `admin: Pubkey`.
  Created once via `initialize_config`.
- `RoleAssignment` — PDA per wallet, seed `[b"role", wallet.key()]`.
  Fields: `wallet: Pubkey`, `role: Role`. Created/overwritten only by the
  admin via `assign_role(wallet, role)`.
- `Role` enum: `Source`, `Carrier`, `Restaurant`.

Every batch/movement/receipt instruction checks the signer's
`RoleAssignment` account matches the role required for that instruction.
A missing `RoleAssignment` account for the signer is treated as
unauthorized (account won't exist / won't deserialize to the expected
role).

## Batch

`Batch` — PDA, seed `[b"batch", batch_id]` where `batch_id: [u8; 16]` is a
caller-supplied unique identifier (e.g. a UUID's bytes), chosen by the
client so the source doesn't need an on-chain counter to avoid collisions
across sources.

Fields:
- `batch_id: [u8; 16]`
- `ingredient_name: String` (max 64 bytes)
- `quantity: u64`
- `source_type: SourceType` enum: `Farmer`, `Factory`, `TraditionalMarket`,
  `Supermarket`
- `source: Pubkey` — the registering wallet
- `status: BatchStatus` enum: `Registered`, `InTransit`, `Delivered`
- `movement_count: u32`
- `received_by: Pubkey` (default `Pubkey::default()` until delivered)
- `created_at: i64`
- `delivered_at: i64` (0 until delivered)

Created via `register_batch(batch_id, ingredient_name, quantity,
source_type)`. Signer must hold `Role::Source`. Fails if `ingredient_name`
exceeds the bounded length. Sets `status = Registered`, `movement_count =
0`, `created_at = Clock::now`.

## Movement (transit leg or warehouse stop)

A single event type covers both a transit leg and a warehouse stop,
distinguished by whether courier/vehicle identity is present — this was
chosen over two separate instructions to keep the instruction surface and
account shape uniform, since the two events differ only in whether a
courier is involved.

`Movement` — PDA, seed `[b"movement", batch.key(), movement_count.to_le_bytes()]`
(`movement_count` is the batch's count *before* this movement, giving each
movement a stable, sequential PDA).

Fields:
- `batch: Pubkey`
- `carrier: Pubkey` (signer)
- `courier_id: Option<String>` (max 32 bytes when present)
- `vehicle_id: Option<String>` (max 32 bytes when present)
- `from_location: String` (max 64 bytes)
- `to_location: String` (max 64 bytes)
- `timestamp: i64`

`courier_id` and `vehicle_id` must both be `Some` (transit leg) or both
`None` (warehouse stop) — mixed states are rejected as invalid input, not
represented as a data possibility.

Created via `log_movement(courier_id, vehicle_id, from_location,
to_location)`. Signer must hold `Role::Carrier`. Fails if `batch.status ==
Delivered` (no movement after delivery). Increments `batch.movement_count`,
sets `batch.status = InTransit`.

## Receipt at restaurant

`receive_at_restaurant()`. Signer must hold `Role::Restaurant`. Fails if
`batch.status == Delivered` already (no double receipt) — the check exists
because this is the on-chain/off-chain boundary handoff and must be
unambiguous about when it happened. Sets `batch.status = Delivered`,
`batch.received_by = signer`, `batch.delivered_at = Clock::now`.

After this point, the restaurant's own inventory system is the source of
truth; this program has no further involvement with that batch.

## Monitoring

No dedicated query instructions — Solana account reads cover both
requirements:
- **Current status**: read the `Batch` account directly (`status`,
  `movement_count`, etc).
- **Full history**: `getProgramAccounts` filtered by the `batch` pubkey
  (memcmp on the `batch` field offset) over `Movement` accounts, ordered
  by the index encoded in each PDA's seed (or by `timestamp`).

This satisfies the "status + history only" monitoring scope agreed during
brainstorming without requiring an off-chain indexer for v1.

## Errors

Extend `error.rs`:
- `Unauthorized` — signer's role doesn't match what the instruction
  requires (reused/renamed from the existing counter error of the same
  name)
- `RoleNotAssigned` — signer has no `RoleAssignment` account
- `InvalidStatusTransition` — movement logged or receipt attempted on an
  already-`Delivered` batch
- `InvalidMovementInput` — `courier_id`/`vehicle_id` mismatched (one
  `Some`, one `None`)
- `StringTooLong` — `ingredient_name` / location / courier / vehicle
  fields exceed their bounded length

## File layout

Following the existing pattern:
- `state.rs` — `Config`, `RoleAssignment`, `Role`, `Batch`, `SourceType`,
  `BatchStatus`, `Movement`
- `constants.rs` — seed prefixes and max string lengths
- `error.rs` — as above
- `instructions/initialize_config.rs`
- `instructions/assign_role.rs`
- `instructions/register_batch.rs`
- `instructions/log_movement.rs`
- `instructions/receive_at_restaurant.rs`
- `lib.rs` — wires the five instructions, removes `initialize`/`increment`
- `tests/` — one litesvm integration test per instruction/flow, replacing
  `test_initialize.rs`: config + role setup, register_batch (happy path +
  wrong-role reject), log_movement (multi-leg + wrong-role reject +
  post-delivery reject), receive_at_restaurant (happy path + double-receive
  reject)

The existing `Counter` account, `initialize`/`increment` instructions,
`COUNTER_SEED`/`HELLO_WORLD_LAMPORTS`/`MAX_COUNT` constants, and
`test_initialize.rs` are deleted as part of this work — they are template
scaffolding, not domain code.
