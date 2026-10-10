# v4 Multi-Role Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A wallet can hold any combination of the four roles (`Admin`, `Source`, `Carrier`, `Restaurant`) simultaneously, and the deployer gets all four automatically and atomically as part of the one-time bootstrap instruction.

**Architecture:** `RoleAssignment` moves from a single `Role` enum field to four explicit booleans (`is_admin`/`is_source`/`is_carrier`/`is_restaurant`). `Config` shrinks to a reference-only `bootstrap_authority` field — Admin-ness is now just one of the four flags, checked the same way as the others, so `initialize_config` creates both `Config` and the caller's own fully-flagged `RoleAssignment` in one atomic instruction. `assign_role` is replaced by `grant_role`/`revoke_role`, each authorized by the caller's own `is_admin` flag rather than a separate `Config.admin` check. The frontend's session, guards, routing, nav, and admin UI all move from "one role" to "a set of roles."

**Tech Stack:** Rust/Anchor (program side, `programs/supply-chain-web3/`), Next.js/React/TypeScript (frontend, `app/`) — same stack as v1–v3, no new dependencies.

**Spec:** [prd/v4_multi_role.md](../../../prd/v4_multi_role.md)

## Global Constraints

- This is a **breaking on-chain layout change** — `RoleAssignment`'s byte shape changes. There is no migration path. Every task's manual verification assumes a fresh `solana-test-validator --reset` + redeploy + re-provision; don't try to test against old on-chain state.
- Build/test the Rust program with `(cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2)` then `cargo test` from the repo root — **not** `anchor build`/`anchor test` (see `docs/superpowers/plans/2026-09-19-restaurant-ingredient-supply-chain-v1.md`'s Global Constraints for why; still true, unrelated to this plan).
- Regenerate the frontend's IDL with `make idl` (repo root Makefile) after any Rust program change this plan makes, before touching frontend code that depends on the new shape — `anchor idl build` compiles via the `idl-build` feature (host target), not `cargo build-sbf`, so it isn't affected by the toolchain workaround above.
- Frontend build/lint/test: `cd app && npm run build`, `npm run lint`, `npm run test` — all three must stay clean, matching this project's established bar (see v3's plan).
- Anchor's TS client camelCases Rust snake_case fields: `is_admin` → `isAdmin`, `bootstrap_authority` → `bootstrapAuthority`, `grant_role` → `grantRole`, etc. — already the established pattern throughout this codebase (e.g. `ingredient_name` → `ingredientName`).
- No self-lockout guard (revoking your own last `is_admin` flag) — explicitly out of scope per the PRD, consistent with this project's existing "demo app" posture elsewhere.

---

## Task 1: On-chain state reshape + atomic bootstrap

**Files:**
- Modify: `programs/supply-chain-web3/src/state.rs`
- Modify: `programs/supply-chain-web3/src/instructions/initialize_config.rs`
- Modify: `programs/supply-chain-web3/tests/test_config_and_roles.rs` (replace contents — this task's test only, Task 2 appends more)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Role` enum now has 4 variants (`Admin, Source, Carrier, Restaurant`); `RoleAssignment { wallet, is_admin, is_source, is_carrier, is_restaurant }`; `Config { bootstrap_authority }`; `InitializeConfig` accounts struct gains a `role_assignment` field (the caller's own PDA, `init`).

- [ ] **Step 1: Write the failing test**

Replace `programs/supply-chain-web3/tests/test_config_and_roles.rs` with:
```rust
use {
    anchor_lang::{
        prelude::Pubkey,
        solana_program::{instruction::Instruction, system_program},
        AccountDeserialize, InstructionData, ToAccountMetas,
    },
    litesvm::LiteSVM,
    solana_keypair::Keypair,
    solana_message::{Message, VersionedMessage},
    solana_signer::Signer,
    solana_transaction::versioned::VersionedTransaction,
    supply_chain_web3::state::{Config, RoleAssignment},
};

fn new_svm_with_payer() -> (LiteSVM, Keypair) {
    let payer = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/supply_chain_web3.so"
    ));
    svm.add_program(supply_chain_web3::id(), bytes).unwrap();
    svm.airdrop(&payer.pubkey(), 1_000_000_000).unwrap();
    (svm, payer)
}

#[test]
fn test_initialize_config_bootstraps_all_roles_for_caller() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();

    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            admin.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            role_assignment,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let config_account = svm.get_account(&config).unwrap();
    let mut data: &[u8] = &config_account.data;
    let config_state = Config::try_deserialize(&mut data).unwrap();
    assert_eq!(config_state.bootstrap_authority, admin.pubkey());

    let role_account = svm.get_account(&role_assignment).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert_eq!(role_state.wallet, admin.pubkey());
    assert!(role_state.is_admin);
    assert!(role_state.is_source);
    assert!(role_state.is_carrier);
    assert!(role_state.is_restaurant);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --test test_config_and_roles` (from repo root — program already built from prior session work, this just needs the test crate to recompile)
Expected: FAIL to compile — `Config::bootstrap_authority`, `RoleAssignment::is_admin` etc. don't exist yet; `InitializeConfig`'s accounts struct has no `role_assignment` field yet.

- [ ] **Step 3: Replace `state.rs`'s `Role`, `Config`, and `RoleAssignment`**

In `programs/supply-chain-web3/src/state.rs`, replace:
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Role {
    Source,
    Carrier,
    Restaurant,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct RoleAssignment {
    pub wallet: Pubkey,
    pub role: Role,
}
```
with:
```rust
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Role {
    Admin,
    Source,
    Carrier,
    Restaurant,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub bootstrap_authority: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct RoleAssignment {
    pub wallet: Pubkey,
    pub is_admin: bool,
    pub is_source: bool,
    pub is_carrier: bool,
    pub is_restaurant: bool,
}
```
Everything else in `state.rs` (`SourceType`, `BatchStatus`, `Batch`, `Movement`) is unchanged — don't touch it.

- [ ] **Step 4: Replace `initialize_config.rs`**

Replace `programs/supply-chain-web3/src/instructions/initialize_config.rs` with:
```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    state::{Config, RoleAssignment},
};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + RoleAssignment::INIT_SPACE,
        seeds = [ROLE_SEED, admin.key().as_ref()],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
    ctx.accounts.config.bootstrap_authority = ctx.accounts.admin.key();

    let role_assignment = &mut ctx.accounts.role_assignment;
    role_assignment.wallet = ctx.accounts.admin.key();
    role_assignment.is_admin = true;
    role_assignment.is_source = true;
    role_assignment.is_carrier = true;
    role_assignment.is_restaurant = true;
    Ok(())
}
```
Using `init` (not `init_if_needed`) for `role_assignment` here is safe: `config`'s own `init` constraint already guarantees this whole instruction can only ever succeed once (a second call fails on `config`'s `init` before `role_assignment` is even attempted).

- [ ] **Step 5: Run the test to verify it passes**

Run: `(cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2)` then `cargo test --test test_config_and_roles` from the repo root.
Expected: 1/1 passing.

- [ ] **Step 6: Commit**

```bash
git add programs/supply-chain-web3/src/state.rs \
  programs/supply-chain-web3/src/instructions/initialize_config.rs \
  programs/supply-chain-web3/tests/test_config_and_roles.rs
git commit -m "feat: reshape RoleAssignment/Config for multi-role, atomic bootstrap"
```

---

## Task 2: `grant_role` / `revoke_role` replace `assign_role`

**Files:**
- Delete: `programs/supply-chain-web3/src/instructions/assign_role.rs`
- Create: `programs/supply-chain-web3/src/instructions/grant_role.rs`
- Create: `programs/supply-chain-web3/src/instructions/revoke_role.rs`
- Modify: `programs/supply-chain-web3/src/instructions.rs`
- Modify: `programs/supply-chain-web3/src/lib.rs`
- Modify: `programs/supply-chain-web3/tests/test_config_and_roles.rs` (append)

**Interfaces:**
- Consumes: `Role` (4-variant, Task 1), `RoleAssignment` (4 bools, Task 1), `ErrorCode::Unauthorized` (existing, unchanged).
- Produces: instructions `grant_role(wallet: Pubkey, role: Role)`, `revoke_role(wallet: Pubkey, role: Role)` — both authorized by the caller's own `RoleAssignment.is_admin`, neither references `Config` at all.

- [ ] **Step 1: Write the failing test**

Append to `programs/supply-chain-web3/tests/test_config_and_roles.rs` (add `Role` to the existing `use supply_chain_web3::state::{...}` import list — it becomes `{Config, Role, RoleAssignment}` — then add the following below the existing test):
```rust
fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> (Pubkey, Pubkey) {
    let program_id = supply_chain_web3::id();
    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let admin_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            admin.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            role_assignment: admin_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    (config, admin_role)
}

#[test]
fn test_grant_role_adds_a_role_to_a_fresh_wallet() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();
    let (_config, admin_role) = init_config(&mut svm, &admin);

    let wallet = Keypair::new();
    let target_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole {
            wallet: wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::GrantRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let role_account = svm.get_account(&target_role).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert_eq!(role_state.wallet, wallet.pubkey());
    assert!(role_state.is_source);
    assert!(!role_state.is_admin);
    assert!(!role_state.is_carrier);
    assert!(!role_state.is_restaurant);
}

#[test]
fn test_grant_role_rejects_non_admin() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();
    init_config(&mut svm, &admin);

    let impostor = Keypair::new();
    svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    let impostor_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            impostor.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let wallet = Keypair::new();
    let target_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole {
            wallet: wallet.pubkey(),
            role: Role::Carrier,
        }
        .data(),
        supply_chain_web3::accounts::GrantRole {
            admin: impostor.pubkey(),
            admin_role_assignment: impostor_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&impostor.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&impostor]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_revoke_role_removes_a_role() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();
    let (_config, admin_role) = init_config(&mut svm, &admin);

    let wallet = Keypair::new();
    let target_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let grant_ix = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole {
            wallet: wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::GrantRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[grant_ix], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let revoke_ix = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RevokeRole {
            wallet: wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::RevokeRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[revoke_ix], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let role_account = svm.get_account(&target_role).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert!(!role_state.is_source);
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cargo test --test test_config_and_roles` from the repo root.
Expected: FAIL to compile — `GrantRole`/`RevokeRole` don't exist yet.

- [ ] **Step 3: Delete `assign_role.rs`**

```bash
rm programs/supply-chain-web3/src/instructions/assign_role.rs
```

- [ ] **Step 4: Create `grant_role.rs`**

Create `programs/supply-chain-web3/src/instructions/grant_role.rs`:
```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Role, RoleAssignment},
};

#[derive(Accounts)]
#[instruction(wallet: Pubkey, role: Role)]
pub struct GrantRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [ROLE_SEED, admin.key().as_ref()], bump)]
    pub admin_role_assignment: Account<'info, RoleAssignment>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + RoleAssignment::INIT_SPACE,
        seeds = [ROLE_SEED, wallet.as_ref()],
        bump
    )]
    pub target_role_assignment: Account<'info, RoleAssignment>,
    pub system_program: Program<'info, System>,
}

pub fn handle_grant_role(ctx: Context<GrantRole>, wallet: Pubkey, role: Role) -> Result<()> {
    require!(
        ctx.accounts.admin_role_assignment.is_admin,
        ErrorCode::Unauthorized,
    );

    let target = &mut ctx.accounts.target_role_assignment;
    target.wallet = wallet;
    match role {
        Role::Admin => target.is_admin = true,
        Role::Source => target.is_source = true,
        Role::Carrier => target.is_carrier = true,
        Role::Restaurant => target.is_restaurant = true,
    }
    Ok(())
}
```

- [ ] **Step 5: Create `revoke_role.rs`**

Create `programs/supply-chain-web3/src/instructions/revoke_role.rs`:
```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Role, RoleAssignment},
};

#[derive(Accounts)]
#[instruction(wallet: Pubkey, role: Role)]
pub struct RevokeRole<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [ROLE_SEED, admin.key().as_ref()], bump)]
    pub admin_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut, seeds = [ROLE_SEED, wallet.as_ref()], bump)]
    pub target_role_assignment: Account<'info, RoleAssignment>,
}

pub fn handle_revoke_role(ctx: Context<RevokeRole>, _wallet: Pubkey, role: Role) -> Result<()> {
    require!(
        ctx.accounts.admin_role_assignment.is_admin,
        ErrorCode::Unauthorized,
    );

    let target = &mut ctx.accounts.target_role_assignment;
    match role {
        Role::Admin => target.is_admin = false,
        Role::Source => target.is_source = false,
        Role::Carrier => target.is_carrier = false,
        Role::Restaurant => target.is_restaurant = false,
    }
    Ok(())
}
```
(`_wallet`: the handler body doesn't need it directly — it's only consumed by the `#[instruction(...)]` macro above to derive `target_role_assignment`'s seeds — prefixed with `_` so Rust doesn't warn about an unused parameter.)

- [ ] **Step 6: Replace `instructions.rs`**

Replace `programs/supply-chain-web3/src/instructions.rs` with:
```rust
pub mod grant_role;
pub mod initialize_config;
pub mod log_movement;
pub mod receive_at_restaurant;
pub mod register_batch;
pub mod revoke_role;

pub use grant_role::*;
pub use initialize_config::*;
pub use log_movement::*;
pub use receive_at_restaurant::*;
pub use register_batch::*;
pub use revoke_role::*;
```

- [ ] **Step 7: Update `lib.rs`**

In `programs/supply-chain-web3/src/lib.rs`, replace:
```rust
    pub fn assign_role(ctx: Context<AssignRole>, wallet: Pubkey, role: Role) -> Result<()> {
        crate::instructions::assign_role::handle_assign_role(ctx, wallet, role)
    }
```
with:
```rust
    pub fn grant_role(ctx: Context<GrantRole>, wallet: Pubkey, role: Role) -> Result<()> {
        crate::instructions::grant_role::handle_grant_role(ctx, wallet, role)
    }

    pub fn revoke_role(ctx: Context<RevokeRole>, wallet: Pubkey, role: Role) -> Result<()> {
        crate::instructions::revoke_role::handle_revoke_role(ctx, wallet, role)
    }
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `(cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2)` then `cargo test --test test_config_and_roles` from the repo root.
Expected: 4/4 passing (1 from Task 1 + 3 new).

- [ ] **Step 9: Commit**

```bash
git add programs/supply-chain-web3/src/instructions.rs \
  programs/supply-chain-web3/src/instructions/grant_role.rs \
  programs/supply-chain-web3/src/instructions/revoke_role.rs \
  programs/supply-chain-web3/src/lib.rs \
  programs/supply-chain-web3/tests/test_config_and_roles.rs
git add -u programs/supply-chain-web3/src/instructions/assign_role.rs
git commit -m "feat: replace assign_role with grant_role/revoke_role"
```

---

## Task 3: Update role checks in `register_batch` / `log_movement` / `receive_at_restaurant` and their tests

**Files:**
- Modify: `programs/supply-chain-web3/src/instructions/register_batch.rs`
- Modify: `programs/supply-chain-web3/src/instructions/log_movement.rs`
- Modify: `programs/supply-chain-web3/src/instructions/receive_at_restaurant.rs`
- Modify: `programs/supply-chain-web3/tests/test_register_batch.rs`
- Modify: `programs/supply-chain-web3/tests/test_log_movement.rs`
- Modify: `programs/supply-chain-web3/tests/test_receive_at_restaurant.rs`

**Interfaces:**
- Consumes: `RoleAssignment`'s 4 bools (Task 1), `GrantRole`/`grant_role` (Task 2).
- Produces: nothing new — this task is a mechanical adaptation of three already-correct instructions and their tests to the new `RoleAssignment` shape.

- [ ] **Step 1: Update the three instruction files' role checks**

In `programs/supply-chain-web3/src/instructions/register_batch.rs`, change:
```rust
    require!(
        ctx.accounts.role_assignment.role == Role::Source,
        ErrorCode::Unauthorized,
    );
```
to:
```rust
    require!(
        ctx.accounts.role_assignment.is_source,
        ErrorCode::Unauthorized,
    );
```
and remove the now-unused `Role` from its `use crate::{..., state::{Batch, BatchStatus, Role, RoleAssignment, SourceType}};` import line (becomes `state::{Batch, BatchStatus, RoleAssignment, SourceType}`).

In `programs/supply-chain-web3/src/instructions/log_movement.rs`, change:
```rust
    require!(
        ctx.accounts.role_assignment.role == Role::Carrier,
        ErrorCode::Unauthorized,
    );
```
to:
```rust
    require!(
        ctx.accounts.role_assignment.is_carrier,
        ErrorCode::Unauthorized,
    );
```
and remove `Role` from its import line (`state::{Batch, BatchStatus, Movement, Role, RoleAssignment}` → `state::{Batch, BatchStatus, Movement, RoleAssignment}`).

In `programs/supply-chain-web3/src/instructions/receive_at_restaurant.rs`, change:
```rust
    require!(
        ctx.accounts.role_assignment.role == Role::Restaurant,
        ErrorCode::Unauthorized,
    );
```
to:
```rust
    require!(
        ctx.accounts.role_assignment.is_restaurant,
        ErrorCode::Unauthorized,
    );
```
and remove `Role` from its import line (`state::{Batch, BatchStatus, Role, RoleAssignment}` → `state::{Batch, BatchStatus, RoleAssignment}`).

None of these three files' `Accounts` structs change — `role_assignment` is still looked up the same way (`seeds = [ROLE_SEED, <signer>.key().as_ref()], bump`, no `init`), only what's read off it changes.

- [ ] **Step 2: Update each test file's `init_config`/`assign_role` helpers**

All three test files (`tests/test_register_batch.rs`, `tests/test_log_movement.rs`, `tests/test_receive_at_restaurant.rs`) currently define their own local `init_config` and `assign_role` helper functions near the top of the file, with this shape:
```rust
fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> Pubkey {
    // ... builds InitializeConfig WITHOUT a role_assignment account, returns just `config`
}

fn assign_role(svm: &mut LiteSVM, admin: &Keypair, config: Pubkey, wallet: Pubkey, role: Role) {
    // ... builds the old AssignRole instruction using `config` for the admin check
}
```

In **each of the three files**, replace both helper functions with:
```rust
fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> Pubkey {
    let program_id = supply_chain_web3::id();
    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let admin_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            admin.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            role_assignment: admin_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    admin_role
}

fn grant_role(svm: &mut LiteSVM, admin: &Keypair, admin_role: Pubkey, wallet: Pubkey, role: Role) {
    let program_id = supply_chain_web3::id();
    let target_role = Pubkey::find_program_address(
        &[supply_chain_web3::constants::ROLE_SEED, wallet.as_ref()],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::GrantRole { wallet, role }.data(),
        supply_chain_web3::accounts::GrantRole {
            admin: admin.pubkey(),
            admin_role_assignment: admin_role,
            target_role_assignment: target_role,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
}
```
Note `init_config`'s return type changed from `Pubkey` (the `config` address, used only by the old `assign_role` helper) to `Pubkey` meaning `admin_role` instead — `config` itself is no longer needed by anything downstream in these three files once `assign_role` is gone, so don't return a tuple, just return `admin_role` directly.

- [ ] **Step 3: Update every call site in all three test files**

In **each of the three files**, every test function currently has a line like:
```rust
let config = init_config(&mut svm, &admin);
```
— change this to:
```rust
let admin_role = init_config(&mut svm, &admin);
```
And every call of the form:
```rust
assign_role(&mut svm, &admin, config, <wallet>.pubkey(), Role::<X>);
```
— change this to:
```rust
grant_role(&mut svm, &admin, admin_role, <wallet>.pubkey(), Role::<X>);
```
This is a pure rename (same argument order, same argument meanings — `config` is just replaced by `admin_role` as the second data argument, and the function name `assign_role` becomes `grant_role`) applied at every call site in `test_register_batch.rs` (2 call sites), `test_log_movement.rs` (4 call sites across 3 tests), and `test_receive_at_restaurant.rs` (6 call sites across 5 tests, including `test_full_lifecycle_register_move_receive`). No other line in any of these three files changes — all the actual `RegisterBatch`/`LogMovement`/`ReceiveAtRestaurant` instruction-building and assertion code is untouched, since none of it ever referenced `Role`, `config`, or `RoleAssignment`'s fields directly.

- [ ] **Step 4: Run the full test suite to verify it passes**

Run: `(cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2)` then `cargo test` from the repo root.
Expected: all program tests passing — 4 (test_config_and_roles) + 3 (test_register_batch) + 3 (test_log_movement) + 5 (test_receive_at_restaurant) = 15, output pristine. `cargo clippy` (`make lint`) should also report nothing new given `Role` was actually removed from imports, not just left unused.

- [ ] **Step 5: Commit**

```bash
git add programs/supply-chain-web3/src/instructions/register_batch.rs \
  programs/supply-chain-web3/src/instructions/log_movement.rs \
  programs/supply-chain-web3/src/instructions/receive_at_restaurant.rs \
  programs/supply-chain-web3/tests/test_register_batch.rs \
  programs/supply-chain-web3/tests/test_log_movement.rs \
  programs/supply-chain-web3/tests/test_receive_at_restaurant.rs
git commit -m "feat: adapt register_batch/log_movement/receive_at_restaurant to RoleAssignment bools"
```

---

## Task 4: Regenerate IDL; session + guard + login rework for a role set

**Files:**
- Regenerate: `app/src/idl/supply_chain_web3.json`, `app/src/idl/supply_chain_web3.ts` (via `make idl`, not hand-written)
- Modify: `app/src/lib/session.ts`
- Modify: `app/src/lib/session.test.ts`
- Modify: `app/src/lib/guard.ts`
- Modify: `app/src/app/login/actions.ts`

**Interfaces:**
- Consumes: the regenerated IDL's `RoleAssignment` type (`isAdmin`/`isSource`/`isCarrier`/`isRestaurant` booleans).
- Produces: `SessionPayload.roles: DemoRole[]` (session.ts); `AuthedSession.roles: DemoRole[]`, `resolveRoles(wallet): Promise<DemoRole[]>` (guard.ts) — Tasks 5 and 6 consume `session.roles`/`resolveRoles` directly.

- [ ] **Step 1: Regenerate the IDL**

Run from the repo root: `make idl`
This requires Tasks 1-3's Rust changes to compile cleanly first (they do, per Task 3's Step 4). Verify the regenerated `app/src/idl/supply_chain_web3.json` contains `grantRole`/`revokeRole` instructions and no `assignRole`, and that `RoleAssignment`'s account definition lists `isAdmin`/`isSource`/`isCarrier`/`isRestaurant` as `bool` fields (not a `role` enum field) — e.g. `grep -A 20 '"name": "RoleAssignment"' app/src/idl/supply_chain_web3.json`.

- [ ] **Step 2: Write the failing test**

Replace `app/src/lib/session.test.ts` with:
```ts
import { beforeAll, describe, expect, it } from "vitest";

import { signSession, verifySession } from "./session";

beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-do-not-use-in-prod";
});

describe("session token signing", () => {
  it("round-trips a valid payload with multiple roles", () => {
    const token = signSession({ wallet: "abc123", roles: ["Source", "Carrier"], iat: 1000 });
    expect(verifySession(token)).toEqual({
      wallet: "abc123",
      roles: ["Source", "Carrier"],
      iat: 1000,
    });
  });

  it("rejects a tampered body", () => {
    const token = signSession({ wallet: "abc123", roles: ["Source"], iat: 1000 });
    const [, signature] = token.split(".");
    const tamperedBody = Buffer.from(
      JSON.stringify({ wallet: "attacker", roles: ["Admin"], iat: 1000 }),
    ).toString("base64url");
    expect(verifySession(`${tamperedBody}.${signature}`)).toBeNull();
  });

  it("rejects a malformed or empty token", () => {
    expect(verifySession("not-a-real-token")).toBeNull();
    expect(verifySession("")).toBeNull();
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `cd app && npm run test -- session.test.ts`
Expected: FAIL — `signSession`/`verifySession` still expect a single `role: DemoRole` field, not `roles: DemoRole[]`.

- [ ] **Step 4: Update `session.ts`**

In `app/src/lib/session.ts`, change:
```ts
export type SessionPayload = {
  wallet: string;
  role: DemoRole;
  iat: number;
};
```
to:
```ts
export type SessionPayload = {
  wallet: string;
  roles: DemoRole[];
  iat: number;
};
```
And in `verifySession`, change the shape guard from:
```ts
    if (
      typeof payload.wallet === "string" &&
      typeof payload.role === "string" &&
      typeof payload.iat === "number"
    ) {
```
to:
```ts
    if (
      typeof payload.wallet === "string" &&
      Array.isArray(payload.roles) &&
      payload.roles.every((role: unknown) => typeof role === "string") &&
      typeof payload.iat === "number"
    ) {
```
`createSession`'s signature (`Omit<SessionPayload, "iat">`) and body are unchanged.

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd app && npm run test -- session.test.ts`
Expected: 3/3 passing.

- [ ] **Step 6: Replace `guard.ts`**

Replace `app/src/lib/guard.ts` with:
```ts
import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";

import type { DemoRole } from "./demo-accounts";
import { roleHomePath } from "./demo-accounts";
import { getReadProgram, roleAssignmentPda } from "./program";
import { getSession } from "./session";

export type AuthedSession = {
  wallet: PublicKey;
  roles: DemoRole[];
};

export async function requireSession(): Promise<AuthedSession> {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  return { wallet: new PublicKey(session.wallet), roles: session.roles };
}

// Next.js disallows mutating cookies during a Server Component render (the
// `destroySession()` cookie delete would throw if called directly from
// here) -- so a role mismatch redirects through the `/api/session-clear`
// route handler, which destroys the stale session and then forwards to
// `/login?error=unauthorized`. Without this, a session whose cached roles
// have gone stale (e.g. an admin revoked this wallet's role) would bounce
// forever between here and `/login`, which trusts the same stale session
// to redirect back to this very page.
const UNAUTHORIZED_REDIRECT = "/api/session-clear";

export async function requireAdmin(): Promise<AuthedSession> {
  const session = await requireSession();
  if (!session.roles.includes("Admin")) {
    redirect(UNAUTHORIZED_REDIRECT);
  }
  return session;
}

export async function requireRole(role: Exclude<DemoRole, "Admin">): Promise<AuthedSession> {
  const session = await requireSession();
  if (!session.roles.includes(role)) {
    redirect(UNAUTHORIZED_REDIRECT);
  }
  return session;
}

const ROLE_ORDER: DemoRole[] = ["Admin", "Source", "Carrier", "Restaurant"];

// One RoleAssignment fetch now yields everything -- Admin-ness is just
// another flag on the same account, so (unlike the single-role v3 model)
// there's no separate Config fetch needed here at all.
export async function resolveRoles(wallet: PublicKey): Promise<DemoRole[]> {
  const program = getReadProgram();
  const [rolePda] = roleAssignmentPda(wallet);
  const assignment = await program.account.roleAssignment.fetchNullable(rolePda);
  if (!assignment) {
    return [];
  }
  const roles: DemoRole[] = [];
  if (assignment.isAdmin) roles.push("Admin");
  if (assignment.isSource) roles.push("Source");
  if (assignment.isCarrier) roles.push("Carrier");
  if (assignment.isRestaurant) roles.push("Restaurant");
  return roles;
}

export async function resolveHomePath(wallet: PublicKey): Promise<string> {
  const roles = await resolveRoles(wallet);
  const preferred = ROLE_ORDER.find((role) => roles.includes(role));
  return preferred ? roleHomePath(preferred) : "/login";
}
```
This drops the `configPda`/`roleLabel` imports entirely (no longer needed) and the `Config`-based admin check `resolveRole` used to do — `requireAdmin`/`requireRole` no longer hit the chain at all (unchanged tradeoff from v3, just applied to a set via `.includes()` instead of `===`).

- [ ] **Step 7: Update `login/actions.ts`**

Replace `app/src/app/login/actions.ts` with:
```ts
"use server";

import { redirect } from "next/navigation";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";

import { resolveRoles } from "@/lib/guard";
import { roleHomePath } from "@/lib/demo-accounts";
import type { DemoRole } from "@/lib/demo-accounts";
import { buildMessage, consumeNonce, issueNonce, verifyNonceToken } from "@/lib/nonce";
import { createSession, destroySession } from "@/lib/session";

export async function requestNonce(): Promise<{ token: string; message: string }> {
  return issueNonce();
}

const ROLE_ORDER: DemoRole[] = ["Admin", "Source", "Carrier", "Restaurant"];

export async function verifyWalletLogin(
  token: string,
  pubkeyBase58: string,
  signatureBase64: string,
): Promise<{ error: string | null }> {
  const payload = verifyNonceToken(token);
  if (!payload) {
    return { error: "Login challenge expired — try again." };
  }

  if (!consumeNonce(payload.nonce, payload.exp)) {
    return { error: "Login challenge already used — try again." };
  }

  let wallet: PublicKey;
  try {
    wallet = new PublicKey(pubkeyBase58);
  } catch {
    return { error: "Invalid wallet address." };
  }

  const message = buildMessage(payload.nonce);
  let verified: boolean;
  try {
    verified = nacl.sign.detached.verify(
      new TextEncoder().encode(message),
      Buffer.from(signatureBase64, "base64"),
      wallet.toBytes(),
    );
  } catch {
    return { error: "Signature verification failed." };
  }
  if (!verified) {
    return { error: "Signature verification failed." };
  }

  const roles = await resolveRoles(wallet);
  if (roles.length === 0) {
    return { error: "This wallet has no on-chain role. Ask an admin to register it." };
  }

  await createSession({ wallet: wallet.toBase58(), roles });
  const preferred = ROLE_ORDER.find((role) => roles.includes(role))!;
  redirect(roleHomePath(preferred));
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
```
(`login/page.tsx` already calls `resolveHomePath` — unchanged by this task, `guard.ts`'s `resolveHomePath` signature didn't change, only its internals — no edit needed there.)

- [ ] **Step 8: Run the full frontend test suite**

Run: `cd app && npm run test`
Expected: all tests pass (31 from v3's final state, `session.test.ts` now exercises the new shape — still 3 tests there, total unchanged at 31), output pristine.

- [ ] **Step 9: Commit**

```bash
cd app && git add src/idl src/lib/session.ts src/lib/session.test.ts src/lib/guard.ts src/app/login/actions.ts
git commit -m "feat: session/guard/login carry a role set instead of one role"
```

---

## Task 5: `format.ts` widens to 4 roles; `NavBar` shows every accessible dashboard

**Files:**
- Modify: `app/src/lib/format.ts`
- Modify: `app/src/lib/format.test.ts`
- Modify: `app/src/components/NavBar.tsx`
- Modify: `app/src/components/RoleBadge.tsx`
- Modify: `app/src/app/source/page.tsx` (NavBar call site only)
- Modify: `app/src/app/carrier/page.tsx` (NavBar call site only)
- Modify: `app/src/app/restaurant/page.tsx` (NavBar call site only)

**Interfaces:**
- Consumes: `session.roles` (Task 4), `AuthedSession` (Task 4).
- Produces: `roleFormArg` now accepts `"Admin" | "Source" | "Carrier" | "Restaurant"` (Task 6's Grant/Revoke forms consume this); `NavBar({ roles, activeRole, wallet })` (no other task consumes this directly — it's a leaf UI component).

- [ ] **Step 1: Write the failing test**

In `app/src/lib/format.test.ts`, add inside the existing `describe("enum label formatting", ...)` block, in the `it("labels roles", ...)` test:
```ts
  it("labels roles", () => {
    expect(roleLabel({ admin: {} })).toBe("Admin");
    expect(roleLabel({ source: {} })).toBe("Source");
    expect(roleLabel({ carrier: {} })).toBe("Carrier");
    expect(roleLabel({ restaurant: {} })).toBe("Restaurant");
  });
```
(replacing the existing 3-assertion version of this same `it` block) and in the `it("builds the enum arg shape the program expects from a UI value", ...)` test, add one more assertion:
```ts
  it("builds the enum arg shape the program expects from a UI value", () => {
    expect(roleFormArg("Admin")).toEqual({ admin: {} });
    expect(roleFormArg("Restaurant")).toEqual({ restaurant: {} });
    expect(sourceTypeFormArg("TraditionalMarket")).toEqual({ traditionalMarket: {} });
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm run test -- format.test.ts`
Expected: FAIL — `roleLabel({ admin: {} })` currently falls through to the unmapped-key fallback (`"admin"` instead of `"Admin"`) since `ROLE_LABELS` has no `admin` entry; `roleFormArg("Admin")` doesn't typecheck yet (its parameter type excludes `"Admin"`).

- [ ] **Step 3: Update `format.ts`**

In `app/src/lib/format.ts`, change:
```ts
const ROLE_LABELS: Record<string, string> = {
  source: "Source",
  carrier: "Carrier",
  restaurant: "Restaurant",
};
```
to:
```ts
const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  source: "Source",
  carrier: "Carrier",
  restaurant: "Restaurant",
};
```
and change:
```ts
export function roleFormArg(role: "Source" | "Carrier" | "Restaurant"): EnumVariant {
  return { [lowerFirst(role)]: {} };
}
```
to:
```ts
export function roleFormArg(role: "Admin" | "Source" | "Carrier" | "Restaurant"): EnumVariant {
  return { [lowerFirst(role)]: {} };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm run test -- format.test.ts`
Expected: all passing.

- [ ] **Step 5: Update `RoleBadge.tsx`**

Replace `app/src/components/RoleBadge.tsx` with:
```tsx
export function RoleBadge({ role, active = true }: { role: string; active?: boolean }) {
  return (
    <span className={`role-badge${active ? "" : " role-badge-inactive"}`}>{role}</span>
  );
}
```

- [ ] **Step 6: Replace `NavBar.tsx`**

Replace `app/src/components/NavBar.tsx` with:
```tsx
import Link from "next/link";
import type { PublicKey } from "@solana/web3.js";

import { logoutAction } from "@/app/login/actions";
import type { DemoRole } from "@/lib/demo-accounts";
import { roleHomePath } from "@/lib/demo-accounts";
import { shortWallet } from "@/lib/format";

import { RoleBadge } from "./RoleBadge";

export function NavBar({
  roles,
  activeRole,
  wallet,
}: {
  roles: DemoRole[];
  activeRole: DemoRole;
  wallet: PublicKey;
}) {
  return (
    <div className="navbar">
      <Link href="/" className="brand">
        <span className="dot" />
        ChainTrace
      </Link>
      <div className="right">
        {roles.map((role) => (
          <Link key={role} href={roleHomePath(role)}>
            <RoleBadge role={role} active={role === activeRole} />
          </Link>
        ))}
        <span className="wallet">{shortWallet(wallet)}</span>
        <form action={logoutAction}>
          <button type="submit" className="link-button">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
```
A multi-role wallet (the bootstrapped deployer, by default) now sees a badge/link for every dashboard it can reach, with the current page's role visually distinguished via `active`.

- [ ] **Step 7: Update three of the four page.tsx `<NavBar>` call sites**

(`admin/page.tsx`'s `<NavBar>` call site is deliberately not touched here — Task 6 replaces that entire file anyway, including an already-updated `<NavBar roles={session.roles} activeRole="Admin" ...>` line, so editing it here would just be overwritten a task later. Only the three files Task 6 doesn't touch need their call site updated now.)

In `app/src/app/source/page.tsx`, change:
```tsx
      <NavBar role="Source" wallet={session.wallet} />
```
to:
```tsx
      <NavBar roles={session.roles} activeRole="Source" wallet={session.wallet} />
```

In `app/src/app/carrier/page.tsx`, change:
```tsx
      <NavBar role="Carrier" wallet={session.wallet} />
```
to:
```tsx
      <NavBar roles={session.roles} activeRole="Carrier" wallet={session.wallet} />
```

In `app/src/app/restaurant/page.tsx`, change:
```tsx
      <NavBar role="Restaurant" wallet={session.wallet} />
```
to:
```tsx
      <NavBar roles={session.roles} activeRole="Restaurant" wallet={session.wallet} />
```

- [ ] **Step 8: Run the full frontend test suite and build**

Run: `cd app && npm run test && npm run build && npm run lint`
Expected: all 31 tests still passing (format.test.ts's existing test count unchanged, just updated assertions), build clean, lint clean. This step doesn't add new automated tests for `NavBar` itself (no component-rendering test harness exists in this project — same established convention, UI composition is verified manually, see Task 7's manual verification).

- [ ] **Step 9: Commit**

```bash
cd app && git add src/lib/format.ts src/lib/format.test.ts src/components/NavBar.tsx \
  src/components/RoleBadge.tsx src/app/source/page.tsx \
  src/app/carrier/page.tsx src/app/restaurant/page.tsx
git commit -m "feat: format.ts and NavBar support all 4 roles, not just 3"
```

---

## Task 6: Admin UI — Grant/Revoke role forms replace the single Assign-role form

**Files:**
- Delete: `app/src/app/admin/AssignRoleForm.tsx`
- Create: `app/src/app/admin/GrantRoleForm.tsx`
- Create: `app/src/app/admin/RevokeRoleForm.tsx`
- Modify: `app/src/app/admin/actions.ts`
- Modify: `app/src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `roleFormArg` (Task 5, now accepts `"Admin"`), `getProgramForWallet`/`SigningWallet` (existing, unchanged).
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Replace `admin/actions.ts`**

Replace `app/src/app/admin/actions.ts` with:
```ts
"use client";

import { PublicKey } from "@solana/web3.js";

import { roleFormArg } from "@/lib/format";
import { getProgramForWallet, type SigningWallet } from "@/lib/program";

type AssignableRole = "Admin" | "Source" | "Carrier" | "Restaurant";

function parseWallet(walletInput: string): { ok: true; pubkey: PublicKey } | { ok: false; error: string } {
  try {
    return { ok: true, pubkey: new PublicKey(walletInput.trim()) };
  } catch {
    return { ok: false, error: "That doesn't look like a valid Solana wallet address." };
  }
}

export async function grantRole(
  wallet: SigningWallet,
  walletInput: string,
  role: AssignableRole,
): Promise<{ error: string | null }> {
  const parsed = parseWallet(walletInput);
  if (!parsed.ok) return { error: parsed.error };

  const program = getProgramForWallet(wallet);
  try {
    // `adminRoleAssignment` (seeds derived from the signer), `targetRoleAssignment`
    // (seeds derived from the `wallet` arg below) and `systemProgram` are all
    // auto-resolved by the client.
    await program.methods
      .grantRole(parsed.pubkey, roleFormArg(role) as never)
      .accounts({ admin: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to grant role." };
  }
  return { error: null };
}

export async function revokeRole(
  wallet: SigningWallet,
  walletInput: string,
  role: AssignableRole,
): Promise<{ error: string | null }> {
  const parsed = parseWallet(walletInput);
  if (!parsed.ok) return { error: parsed.error };

  const program = getProgramForWallet(wallet);
  try {
    await program.methods
      .revokeRole(parsed.pubkey, roleFormArg(role) as never)
      .accounts({ admin: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to revoke role." };
  }
  return { error: null };
}
```

- [ ] **Step 2: Create `GrantRoleForm.tsx`**

Create `app/src/app/admin/GrantRoleForm.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

import { grantRole } from "./actions";

export function GrantRoleForm() {
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
    const role = String(formData.get("role") ?? "") as
      | "Admin"
      | "Source"
      | "Carrier"
      | "Restaurant";
    const result = await grantRole(wallet, walletInput, role);
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
        <label htmlFor="grant-wallet">Wallet address</label>
        <input
          id="grant-wallet"
          name="wallet"
          className="mono"
          type="text"
          placeholder="9pL4...c22Z"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="grant-role">Role</label>
        <select id="grant-role" name="role" required defaultValue="Source">
          <option value="Admin">Admin</option>
          <option value="Source">Source</option>
          <option value="Carrier">Carrier</option>
          <option value="Restaurant">Restaurant</option>
        </select>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Granting…" : "Grant role"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Create `RevokeRoleForm.tsx`**

Create `app/src/app/admin/RevokeRoleForm.tsx`:
```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAnchorWallet } from "@solana/wallet-adapter-react";

import { revokeRole } from "./actions";

export function RevokeRoleForm() {
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
    const role = String(formData.get("role") ?? "") as
      | "Admin"
      | "Source"
      | "Carrier"
      | "Restaurant";
    const result = await revokeRole(wallet, walletInput, role);
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
        <label htmlFor="revoke-wallet">Wallet address</label>
        <input
          id="revoke-wallet"
          name="wallet"
          className="mono"
          type="text"
          placeholder="9pL4...c22Z"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="revoke-role">Role</label>
        <select id="revoke-role" name="role" required defaultValue="Source">
          <option value="Admin">Admin</option>
          <option value="Source">Source</option>
          <option value="Carrier">Carrier</option>
          <option value="Restaurant">Restaurant</option>
        </select>
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Revoking…" : "Revoke role"}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Delete `AssignRoleForm.tsx` and update `admin/page.tsx`**

```bash
rm app/src/app/admin/AssignRoleForm.tsx
```
Replace `app/src/app/admin/page.tsx` with:
```tsx
import { fetchAllBatches } from "@/lib/accounts";
import { requireAdmin } from "@/lib/guard";
import { BatchTable } from "@/components/BatchTable";
import { NavBar } from "@/components/NavBar";

import { GrantRoleForm } from "./GrantRoleForm";
import { RevokeRoleForm } from "./RevokeRoleForm";

export default async function AdminPage() {
  const session = await requireAdmin();
  const batches = await fetchAllBatches();

  return (
    <div>
      <NavBar roles={session.roles} activeRole="Admin" wallet={session.wallet} />
      <div className="page layout-split">
        <div className="panel-narrow" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div className="card">
            <div className="section-title">Grant role</div>
            <div className="section-sub">grant_role(wallet, role)</div>
            <GrantRoleForm />
          </div>
          <div className="card">
            <div className="section-title">Revoke role</div>
            <div className="section-sub">revoke_role(wallet, role)</div>
            <RevokeRoleForm />
          </div>
        </div>
        <div className="panel-wide card">
          <div className="section-title">All batches</div>
          <div className="section-sub">
            Admin-wide monitoring — every registered batch &amp; its status
          </div>
          <BatchTable batches={batches} showSource />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the full frontend test suite, build, and lint**

Run: `cd app && npm run test && npm run build && npm run lint`
Expected: all 31 tests passing, build clean, lint clean. No new automated tests here — the real verification is the manual round trip in Task 7 (same established convention as every prior wallet-signing UI piece in this project).

- [ ] **Step 6: Commit**

```bash
cd app && git add src/app/admin/actions.ts src/app/admin/GrantRoleForm.tsx \
  src/app/admin/RevokeRoleForm.tsx src/app/admin/page.tsx
git add -u src/app/admin/AssignRoleForm.tsx
git commit -m "feat: admin UI gets separate Grant/Revoke role forms"
```

---

## Task 7: Provisioning script update + full end-to-end verification

**Files:**
- Modify: `app/scripts/provision-demo-accounts.ts`
- Modify: `app/src/lib/demo-accounts.ts` (doc comment only — it references the old `Config.admin` model)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — this is the final task; its manual verification is this whole plan's acceptance test.

- [ ] **Step 1: Update `provision-demo-accounts.ts`**

In `app/scripts/provision-demo-accounts.ts`, change:
```ts
  } else if (!existingConfig.admin.equals(admin.publicKey)) {
    throw new Error(
      `On-chain Config.admin (${existingConfig.admin.toBase58()}) does not match the local ` +
        `admin demo keypair (${admin.publicKey.toBase58()}). The PRD requires the Admin demo ` +
        "account to be the same keypair that ran initialize_config.",
    );
```
to:
```ts
  } else if (!existingConfig.bootstrapAuthority.equals(admin.publicKey)) {
    throw new Error(
      `On-chain Config.bootstrap_authority (${existingConfig.bootstrapAuthority.toBase58()}) does not match the local ` +
        `admin demo keypair (${admin.publicKey.toBase58()}). The PRD requires the Admin demo ` +
        "account to be the same keypair that ran initialize_config.",
    );
```
The `initializeConfig()` call itself (`await adminProgram.methods.initializeConfig().accounts({ admin: admin.publicKey }).rpc();`) is unchanged — `role_assignment` is auto-resolved from the signer's own key by the generated client, same as `config` already is.

Change the closing log messages from:
```ts
  console.log("\nDemo keypairs ready. Admin is on-chain; Source/Carrier/Restaurant still need");
  console.log("role assignments — log in as Admin and use the /admin page to assign each one:");
  for (const [role, keypair] of keypairs) {
    if (role === "Admin") continue;
    console.log(`  ${role.padEnd(10)} ${keypair.publicKey.toBase58()}`);
  }
```
to:
```ts
  console.log("\nDemo keypairs ready. Admin is on-chain with ALL FOUR roles (bootstrap grants");
  console.log("Admin+Source+Carrier+Restaurant to the caller automatically). The separate");
  console.log("Source/Carrier/Restaurant demo wallets still need their roles granted");
  console.log("individually — log in as Admin and use the /admin page's Grant-role form:");
  for (const [role, keypair] of keypairs) {
    if (role === "Admin") continue;
    console.log(`  ${role.padEnd(10)} ${keypair.publicKey.toBase58()}`);
  }
```

- [ ] **Step 2: Update the stale comment in `demo-accounts.ts`**

In `app/src/lib/demo-accounts.ts`, change:
```ts
// Demo keypairs only — see prd/v3_wallet_auth.md "Demo wallets". These are
// NOT credentials: there's no password anymore. A wallet's actual
// authority comes from its on-chain RoleAssignment (or being Config.admin),
// checked at login via resolveRole — this list only maps a role label to
// which keypair file backs that role's demo button.
```
to:
```ts
// Demo keypairs only — see prd/v3_wallet_auth.md "Demo wallets" and
// prd/v4_multi_role.md. These are NOT credentials: there's no password
// anymore. A wallet's actual authority comes entirely from its on-chain
// RoleAssignment (Admin is just one of its four flags now, not a separate
// Config.admin check) — checked at login via resolveRoles. This list only
// maps a role label to which keypair file backs that role's demo button.
```

- [ ] **Step 3: Run the frontend test suite**

Run: `cd app && npm run test`
Expected: 31/31 passing (this task adds no new automated tests — see Step 4 for why).

- [ ] **Step 4: Full end-to-end manual verification**

This is the plan's actual acceptance test — there's no automated substitute for it in this project (same established convention as every prior plan's final task). Start from completely fresh on-chain state:

```bash
# From the repo root:
pkill -f solana-test-validator  # if one is already running
make validator  # starts fresh --reset validator
# in another terminal, from the repo root:
(cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2)
anchor deploy
rm -rf app/.demo-keys
cd app && npm run provision
```
Confirm `npm run provision`'s output now says "Admin is on-chain with ALL FOUR roles" (per Step 1's updated message) and still lists Source/Carrier/Restaurant demo pubkeys as needing individual grants.

Run `make web` (or `npm run dev` inside `app/`). Then, using the demo login buttons (no real wallet needed, per v3):

1. **Log in as Admin.** Confirm the `NavBar` now shows **four** role badges/links (Admin, Source, Carrier, Restaurant), not one.
2. **Without logging out**, click through to `/source` via the NavBar link (not the demo-login button — proving the *same session* carries access, not a fresh login). Register a batch. Confirm it succeeds — the deployer/admin wallet is acting as Source.
3. Click through to `/carrier` via the NavBar. Log a movement against that batch. Confirm it succeeds and the batch's status becomes `InTransit` on `/batch/[id]`.
4. Click through to `/restaurant` via the NavBar. Receive that batch. Confirm it succeeds and status becomes `Delivered`.
5. Click through to `/admin` via the NavBar. Use the **Grant role** form to grant `Source` to the Source demo wallet's pubkey (from `npm run provision`'s output). Confirm no error.
6. Sign out, log in as the **Source** demo wallet (a genuinely different wallet now, not the admin). Confirm it can still register a batch on its own — proving `grant_role` correctly extends access to a *non-bootstrap* wallet too, not just the deployer.
7. Back as Admin, use the **Revoke role** form to revoke `Source` from that same wallet. Sign out, attempt to log in as the Source demo wallet again. Confirm login now fails with "This wallet has no on-chain role" (it still has no other role granted) — proving `revoke_role` actually removes access.

This proves the plan's actual goal end to end: the deployer wallet genuinely holds and can exercise all four roles simultaneously from the moment of bootstrap, and the grant/revoke mechanism works correctly for wallets beyond the deployer too.

- [ ] **Step 5: Commit**

```bash
cd app && git add scripts/provision-demo-accounts.ts src/lib/demo-accounts.ts
git commit -m "chore: provisioning script and comments reflect multi-role bootstrap"
```
