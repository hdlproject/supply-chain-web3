# Restaurant Ingredient Supply Chain v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Anchor counter template with a Solana program that tracks a restaurant's ingredient batches from source through movements to final receipt, with role-gated access and on-chain status/history queries.

**Architecture:** A single Anchor program (`supply_chain_web3`) with five instructions (`initialize_config`, `assign_role`, `register_batch`, `log_movement`, `receive_at_restaurant`) operating over four PDA account types (`Config`, `RoleAssignment`, `Batch`, `Movement`). Access control is role-based: an admin (set once via `initialize_config`) assigns `Source`/`Carrier`/`Restaurant` roles to wallets, and each instruction checks the signer's role before mutating state.

**Tech Stack:** Rust, Anchor (`anchor-lang`), Solana, `litesvm` for integration tests (matches the existing `test_initialize.rs` pattern).

**Spec:** [prd/v1_basic_functionality.md](../../../prd/v1_basic_functionality.md)

## Global Constraints

- Rust edition 2021, rust-version 1.89.0 (from workspace `Cargo.toml` / `rust-toolchain.toml`) — unchanged.
- `anchor-lang` stays at version `1.2.0`; add the `init-if-needed` feature (needed for `assign_role` to be re-runnable by the admin).
- Program id stays `5k3AeBoUR2LsjXT8XtddP9VfcnztLQyiK5YgYscPtReX` (`declare_id!` unchanged).
- Bounded string lengths (from spec): `ingredient_name` max 64 bytes, `from_location`/`to_location` max 64 bytes, `courier_id`/`vehicle_id` max 32 bytes each.
- **Build/test command (environment-specific override — supersedes the plan's "Run: `anchor test`" steps):** in this environment, `anchor build`/`anchor test` (default platform-tools `v1.57`, and the standalone `cargo build-sbf`'s own default `v1.52`) both produce a `.so` that `litesvm` 0.10.0 rejects at `svm.add_program()` with `InvalidAccountData` — reproduced even on the untouched pre-Task-1 counter scaffold, so it's a pre-existing local toolchain mismatch, not something any task's code causes. `anchor build --tools-version v2.3.2` also fails outright (rustc/sysroot error `E0463`). The verified-working recipe: build the program directly with platform-tools `v2.3.2`, then run tests as plain `cargo test` from the repo root — **not** `anchor build`/`anchor test`:
  ```bash
  (cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2)
  cargo test
  ```
  Re-run the first line whenever program code changes (it rebuilds `target/deploy/supply_chain_web3.so`); `cargo test` alone is enough after that if only test code changed.
- The existing `Counter` template (`state::Counter`, `instructions::initialize`/`increment`, `constants::COUNTER_SEED`/`HELLO_WORLD_LAMPORTS`/`MAX_COUNT`, `error::ErrorCode::CounterOverflow`, `tests/test_initialize.rs`) is deleted, not kept alongside the new code.

---

## Task 1: Config + role assignment (replaces counter scaffold)

**Files:**
- Modify: `programs/supply-chain-web3/Cargo.toml` (add `init-if-needed` feature)
- Modify: `programs/supply-chain-web3/src/constants.rs` (replace contents)
- Modify: `programs/supply-chain-web3/src/state.rs` (replace contents)
- Modify: `programs/supply-chain-web3/src/error.rs` (replace contents)
- Modify: `programs/supply-chain-web3/src/instructions.rs` (replace contents)
- Delete: `programs/supply-chain-web3/src/instructions/initialize.rs`
- Delete: `programs/supply-chain-web3/src/instructions/increment.rs`
- Create: `programs/supply-chain-web3/src/instructions/initialize_config.rs`
- Create: `programs/supply-chain-web3/src/instructions/assign_role.rs`
- Modify: `programs/supply-chain-web3/src/lib.rs` (replace contents)
- Delete: `programs/supply-chain-web3/tests/test_initialize.rs`
- Test: `programs/supply-chain-web3/tests/test_config_and_roles.rs`

**Interfaces:**
- Produces: `state::Role` enum (`Source`, `Carrier`, `Restaurant`; derives `AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace`), `state::Config { admin: Pubkey }`, `state::RoleAssignment { wallet: Pubkey, role: Role }`, `constants::CONFIG_SEED: &[u8]`, `constants::ROLE_SEED: &[u8]`, `error::ErrorCode::Unauthorized`, instruction `initialize_config(ctx)`, instruction `assign_role(ctx, wallet: Pubkey, role: Role)`.
- Consumes: nothing from other tasks (first task).

- [ ] **Step 1: Write the failing test**

Create `programs/supply-chain-web3/tests/test_config_and_roles.rs`:

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
    supply_chain_web3::state::{Role, RoleAssignment},
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
fn test_initialize_config_and_assign_role() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();

    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
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
    let config_state = supply_chain_web3::state::Config::try_deserialize(&mut data).unwrap();
    assert_eq!(config_state.admin, admin.pubkey());

    let source_wallet = Keypair::new();
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source_wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::AssignRole {
            wallet: source_wallet.pubkey(),
            role: Role::Source,
        }
        .data(),
        supply_chain_web3::accounts::AssignRole {
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

    let role_account = svm.get_account(&role_assignment).unwrap();
    let mut data: &[u8] = &role_account.data;
    let role_state = RoleAssignment::try_deserialize(&mut data).unwrap();
    assert_eq!(role_state.wallet, source_wallet.pubkey());
    assert_eq!(role_state.role, Role::Source);
}

#[test]
fn test_assign_role_rejects_non_admin() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_payer();

    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let impostor = Keypair::new();
    svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    let target_wallet = Keypair::new();
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            target_wallet.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::AssignRole {
            wallet: target_wallet.pubkey(),
            role: Role::Carrier,
        }
        .data(),
        supply_chain_web3::accounts::AssignRole {
            admin: impostor.pubkey(),
            config,
            role_assignment,
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `anchor test`
Expected: FAIL to compile — `supply_chain_web3::instruction::InitializeConfig`, `AssignRole`, `state::Role`, `state::RoleAssignment`, `constants::CONFIG_SEED`, `constants::ROLE_SEED` don't exist yet.

- [ ] **Step 3: Delete the counter scaffold files**

```bash
rm programs/supply-chain-web3/src/instructions/initialize.rs
rm programs/supply-chain-web3/src/instructions/increment.rs
rm programs/supply-chain-web3/tests/test_initialize.rs
```

- [ ] **Step 4: Add the `init-if-needed` feature to Cargo.toml**

In `programs/supply-chain-web3/Cargo.toml`, replace:

```toml
[dependencies]
anchor-lang = "1.2.0"
```

with:

```toml
[dependencies]
anchor-lang = { version = "1.2.0", features = ["init-if-needed"] }
```

- [ ] **Step 5: Replace `constants.rs`**

```rust
use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const ROLE_SEED: &[u8] = b"role";
```

- [ ] **Step 6: Replace `state.rs`**

```rust
use anchor_lang::prelude::*;

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

- [ ] **Step 7: Replace `error.rs`**

```rust
use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer is not authorized to perform this action")]
    Unauthorized,
}
```

- [ ] **Step 8: Create `instructions/initialize_config.rs`**

```rust
use anchor_lang::prelude::*;

use crate::{constants::*, state::Config};

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
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
    ctx.accounts.config.admin = ctx.accounts.admin.key();
    Ok(())
}
```

- [ ] **Step 9: Create `instructions/assign_role.rs`**

```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Config, Role, RoleAssignment},
};

#[derive(Accounts)]
#[instruction(wallet: Pubkey, role: Role)]
pub struct AssignRole<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(seeds = [CONFIG_SEED], bump)]
    pub config: Account<'info, Config>,
    #[account(
        init_if_needed,
        payer = admin,
        space = 8 + RoleAssignment::INIT_SPACE,
        seeds = [ROLE_SEED, wallet.as_ref()],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    pub system_program: Program<'info, System>,
}

pub fn handle_assign_role(ctx: Context<AssignRole>, wallet: Pubkey, role: Role) -> Result<()> {
    require_keys_eq!(
        ctx.accounts.config.admin,
        ctx.accounts.admin.key(),
        ErrorCode::Unauthorized,
    );

    ctx.accounts.role_assignment.wallet = wallet;
    ctx.accounts.role_assignment.role = role;
    Ok(())
}
```

- [ ] **Step 10: Replace `instructions.rs`**

```rust
pub mod assign_role;
pub mod initialize_config;

pub use assign_role::*;
pub use initialize_config::*;
```

- [ ] **Step 11: Replace `lib.rs`**

```rust
pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("5k3AeBoUR2LsjXT8XtddP9VfcnztLQyiK5YgYscPtReX");

#[program]
pub mod supply_chain_web3 {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        crate::instructions::initialize_config::handle_initialize_config(ctx)
    }

    pub fn assign_role(ctx: Context<AssignRole>, wallet: Pubkey, role: Role) -> Result<()> {
        crate::instructions::assign_role::handle_assign_role(ctx, wallet, role)
    }
}
```

- [ ] **Step 12: Run test to verify it passes**

Run: `anchor test`
Expected: both tests in `test_config_and_roles.rs` PASS.

- [ ] **Step 13: Commit**

```bash
git add programs/supply-chain-web3/Cargo.toml \
  programs/supply-chain-web3/src/constants.rs \
  programs/supply-chain-web3/src/state.rs \
  programs/supply-chain-web3/src/error.rs \
  programs/supply-chain-web3/src/instructions.rs \
  programs/supply-chain-web3/src/instructions/initialize_config.rs \
  programs/supply-chain-web3/src/instructions/assign_role.rs \
  programs/supply-chain-web3/src/lib.rs \
  programs/supply-chain-web3/tests/test_config_and_roles.rs
git add -u programs/supply-chain-web3/src/instructions/initialize.rs \
  programs/supply-chain-web3/src/instructions/increment.rs \
  programs/supply-chain-web3/tests/test_initialize.rs
git commit -m "feat: replace counter scaffold with config + role assignment"
```

---

## Task 2: Batch registration

**Files:**
- Modify: `programs/supply-chain-web3/src/constants.rs` (append)
- Modify: `programs/supply-chain-web3/src/state.rs` (append)
- Modify: `programs/supply-chain-web3/src/error.rs` (append)
- Create: `programs/supply-chain-web3/src/instructions/register_batch.rs`
- Modify: `programs/supply-chain-web3/src/instructions.rs` (add module)
- Modify: `programs/supply-chain-web3/src/lib.rs` (add instruction)
- Test: `programs/supply-chain-web3/tests/test_register_batch.rs`

**Interfaces:**
- Consumes: `constants::ROLE_SEED` (Task 1), `state::{Role, RoleAssignment}` (Task 1), `error::ErrorCode::Unauthorized` (Task 1).
- Produces: `state::SourceType` enum (`Farmer`, `Factory`, `TraditionalMarket`, `Supermarket`), `state::BatchStatus` enum (`Registered`, `InTransit`, `Delivered`), `state::Batch { batch_id: [u8;16], ingredient_name: String, quantity: u64, source_type: SourceType, source: Pubkey, status: BatchStatus, movement_count: u32, received_by: Pubkey, created_at: i64, delivered_at: i64 }`, `constants::BATCH_SEED`, `constants::MAX_INGREDIENT_NAME_LEN: usize`, `error::ErrorCode::StringTooLong`, instruction `register_batch(ctx, batch_id: [u8;16], ingredient_name: String, quantity: u64, source_type: SourceType)`.

- [ ] **Step 1: Write the failing test**

Create `programs/supply-chain-web3/tests/test_register_batch.rs`:

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
    supply_chain_web3::state::{Batch, BatchStatus, Role, SourceType},
};

fn new_svm_with_admin() -> (LiteSVM, Keypair) {
    let admin = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/supply_chain_web3.so"
    ));
    svm.add_program(supply_chain_web3::id(), bytes).unwrap();
    svm.airdrop(&admin.pubkey(), 1_000_000_000).unwrap();
    (svm, admin)
}

fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> Pubkey {
    let program_id = supply_chain_web3::id();
    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    config
}

fn assign_role(svm: &mut LiteSVM, admin: &Keypair, config: Pubkey, wallet: Pubkey, role: Role) {
    let program_id = supply_chain_web3::id();
    let role_assignment = Pubkey::find_program_address(
        &[supply_chain_web3::constants::ROLE_SEED, wallet.as_ref()],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::AssignRole { wallet, role }.data(),
        supply_chain_web3::accounts::AssignRole {
            admin: admin.pubkey(),
            config,
            role_assignment,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
}

#[test]
fn test_register_batch_happy_path() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);

    let batch_id: [u8; 16] = [7u8; 16];
    let batch = Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &program_id,
    )
    .0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "Chicken Breast".to_string(),
            quantity: 50,
            source_type: SourceType::Farmer,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source: source.pubkey(),
            role_assignment,
            batch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.batch_id, batch_id);
    assert_eq!(batch_state.ingredient_name, "Chicken Breast");
    assert_eq!(batch_state.quantity, 50);
    assert_eq!(batch_state.source_type, SourceType::Farmer);
    assert_eq!(batch_state.source, source.pubkey());
    assert_eq!(batch_state.status, BatchStatus::Registered);
    assert_eq!(batch_state.movement_count, 0);
}

#[test]
fn test_register_batch_rejects_wrong_role() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, carrier.pubkey(), Role::Carrier);

    let batch_id: [u8; 16] = [1u8; 16];
    let batch = Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &program_id,
    )
    .0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "Rice".to_string(),
            quantity: 10,
            source_type: SourceType::Supermarket,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source: carrier.pubkey(),
            role_assignment,
            batch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_register_batch_rejects_name_too_long() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);

    let batch_id: [u8; 16] = [2u8; 16];
    let batch = Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &program_id,
    )
    .0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "x".repeat(65),
            quantity: 1,
            source_type: SourceType::Factory,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source: source.pubkey(),
            role_assignment,
            batch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `anchor test`
Expected: FAIL to compile — `RegisterBatch`, `Batch`, `BatchStatus`, `SourceType`, `constants::BATCH_SEED` don't exist yet.

- [ ] **Step 3: Append to `constants.rs`**

```rust

#[constant]
pub const BATCH_SEED: &[u8] = b"batch";

#[constant]
pub const MAX_INGREDIENT_NAME_LEN: usize = 64;
```

- [ ] **Step 4: Append to `state.rs`**

```rust

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum SourceType {
    Farmer,
    Factory,
    TraditionalMarket,
    Supermarket,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum BatchStatus {
    Registered,
    InTransit,
    Delivered,
}

#[account]
#[derive(InitSpace)]
pub struct Batch {
    pub batch_id: [u8; 16],
    #[max_len(MAX_INGREDIENT_NAME_LEN)]
    pub ingredient_name: String,
    pub quantity: u64,
    pub source_type: SourceType,
    pub source: Pubkey,
    pub status: BatchStatus,
    pub movement_count: u32,
    pub received_by: Pubkey,
    pub created_at: i64,
    pub delivered_at: i64,
}
```

`state.rs` needs `crate::constants::*` in scope for `MAX_INGREDIENT_NAME_LEN` inside `#[max_len(...)]` — add this import at the top of the file (it currently only has `use anchor_lang::prelude::*;`):

```rust
use crate::constants::*;
```

- [ ] **Step 5: Append to `error.rs`**

```rust

    #[msg("Provided string exceeds maximum allowed length")]
    StringTooLong,
```

(insert this variant inside the existing `ErrorCode` enum body, after `Unauthorized`)

- [ ] **Step 6: Create `instructions/register_batch.rs`**

```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Batch, BatchStatus, Role, RoleAssignment, SourceType},
};

#[derive(Accounts)]
#[instruction(batch_id: [u8; 16])]
pub struct RegisterBatch<'info> {
    #[account(mut)]
    pub source: Signer<'info>,
    #[account(seeds = [ROLE_SEED, source.key().as_ref()], bump)]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(
        init,
        payer = source,
        space = 8 + Batch::INIT_SPACE,
        seeds = [BATCH_SEED, batch_id.as_ref()],
        bump
    )]
    pub batch: Account<'info, Batch>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_batch(
    ctx: Context<RegisterBatch>,
    batch_id: [u8; 16],
    ingredient_name: String,
    quantity: u64,
    source_type: SourceType,
) -> Result<()> {
    require!(
        ctx.accounts.role_assignment.role == Role::Source,
        ErrorCode::Unauthorized,
    );
    require!(
        ingredient_name.len() <= MAX_INGREDIENT_NAME_LEN,
        ErrorCode::StringTooLong,
    );

    let batch = &mut ctx.accounts.batch;
    batch.batch_id = batch_id;
    batch.ingredient_name = ingredient_name;
    batch.quantity = quantity;
    batch.source_type = source_type;
    batch.source = ctx.accounts.source.key();
    batch.status = BatchStatus::Registered;
    batch.movement_count = 0;
    batch.received_by = Pubkey::default();
    batch.created_at = Clock::get()?.unix_timestamp;
    batch.delivered_at = 0;
    Ok(())
}
```

- [ ] **Step 7: Add module to `instructions.rs`**

Replace contents with:

```rust
pub mod assign_role;
pub mod initialize_config;
pub mod register_batch;

pub use assign_role::*;
pub use initialize_config::*;
pub use register_batch::*;
```

- [ ] **Step 8: Add instruction to `lib.rs`**

Inside `pub mod supply_chain_web3 { ... }`, after `assign_role`, add:

```rust

    pub fn register_batch(
        ctx: Context<RegisterBatch>,
        batch_id: [u8; 16],
        ingredient_name: String,
        quantity: u64,
        source_type: SourceType,
    ) -> Result<()> {
        crate::instructions::register_batch::handle_register_batch(
            ctx,
            batch_id,
            ingredient_name,
            quantity,
            source_type,
        )
    }
```

- [ ] **Step 9: Run test to verify it passes**

Run: `anchor test`
Expected: all three tests in `test_register_batch.rs` PASS (plus Task 1's tests still passing).

- [ ] **Step 10: Commit**

```bash
git add programs/supply-chain-web3/src/constants.rs \
  programs/supply-chain-web3/src/state.rs \
  programs/supply-chain-web3/src/error.rs \
  programs/supply-chain-web3/src/instructions.rs \
  programs/supply-chain-web3/src/instructions/register_batch.rs \
  programs/supply-chain-web3/src/lib.rs \
  programs/supply-chain-web3/tests/test_register_batch.rs
git commit -m "feat: add register_batch instruction"
```

---

## Task 3: Movement logging

**Files:**
- Modify: `programs/supply-chain-web3/src/constants.rs` (append)
- Modify: `programs/supply-chain-web3/src/state.rs` (append)
- Modify: `programs/supply-chain-web3/src/error.rs` (append)
- Create: `programs/supply-chain-web3/src/instructions/log_movement.rs`
- Modify: `programs/supply-chain-web3/src/instructions.rs` (add module)
- Modify: `programs/supply-chain-web3/src/lib.rs` (add instruction)
- Test: `programs/supply-chain-web3/tests/test_log_movement.rs`

**Interfaces:**
- Consumes: `constants::{ROLE_SEED, BATCH_SEED, MAX_INGREDIENT_NAME_LEN}` (Tasks 1-2), `state::{Role, RoleAssignment, Batch, BatchStatus, SourceType}` (Tasks 1-2), `error::ErrorCode::{Unauthorized, StringTooLong}` (Tasks 1-2).
- Produces: `state::Movement { batch: Pubkey, carrier: Pubkey, courier_id: Option<String>, vehicle_id: Option<String>, from_location: String, to_location: String, timestamp: i64 }`, `constants::MOVEMENT_SEED`, `constants::MAX_LOCATION_LEN: usize`, `constants::MAX_ID_LEN: usize`, `error::ErrorCode::{InvalidStatusTransition, InvalidMovementInput}`, instruction `log_movement(ctx, courier_id: Option<String>, vehicle_id: Option<String>, from_location: String, to_location: String)`.

- [ ] **Step 1: Write the failing test**

Create `programs/supply-chain-web3/tests/test_log_movement.rs`:

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
    supply_chain_web3::state::{Batch, BatchStatus, Movement, Role, SourceType},
};

fn new_svm_with_admin() -> (LiteSVM, Keypair) {
    let admin = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/supply_chain_web3.so"
    ));
    svm.add_program(supply_chain_web3::id(), bytes).unwrap();
    svm.airdrop(&admin.pubkey(), 1_000_000_000).unwrap();
    (svm, admin)
}

fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> Pubkey {
    let program_id = supply_chain_web3::id();
    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    config
}

fn assign_role(svm: &mut LiteSVM, admin: &Keypair, config: Pubkey, wallet: Pubkey, role: Role) {
    let program_id = supply_chain_web3::id();
    let role_assignment = Pubkey::find_program_address(
        &[supply_chain_web3::constants::ROLE_SEED, wallet.as_ref()],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::AssignRole { wallet, role }.data(),
        supply_chain_web3::accounts::AssignRole {
            admin: admin.pubkey(),
            config,
            role_assignment,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
}

fn register_batch(svm: &mut LiteSVM, source: &Keypair, batch_id: [u8; 16]) -> Pubkey {
    let program_id = supply_chain_web3::id();
    let batch = Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &program_id,
    )
    .0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "Tomatoes".to_string(),
            quantity: 20,
            source_type: SourceType::TraditionalMarket,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source: source.pubkey(),
            role_assignment,
            batch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[source]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    batch
}

fn movement_pda(batch: Pubkey, movement_count: u32) -> Pubkey {
    let program_id = supply_chain_web3::id();
    Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::MOVEMENT_SEED,
            batch.as_ref(),
            &movement_count.to_le_bytes(),
        ],
        &program_id,
    )
    .0
}

#[test]
fn test_log_movement_transit_then_warehouse_stop() {
    let program_id = supply_chain_web3::id();
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [3u8; 16]);

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, carrier.pubkey(), Role::Carrier);
    let carrier_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    // Leg 1: transit leg with courier + vehicle.
    let movement_0 = movement_pda(batch, 0);
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            courier_id: Some("COURIER-1".to_string()),
            vehicle_id: Some("VEHICLE-1".to_string()),
            from_location: "Traditional Market".to_string(),
            to_location: "Transit Hub".to_string(),
        }
        .data(),
        supply_chain_web3::accounts::LogMovement {
            carrier: carrier.pubkey(),
            role_assignment: carrier_role,
            batch,
            movement: movement_0,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let movement_account = svm.get_account(&movement_0).unwrap();
    let mut data: &[u8] = &movement_account.data;
    let movement_state = Movement::try_deserialize(&mut data).unwrap();
    assert_eq!(movement_state.batch, batch);
    assert_eq!(movement_state.courier_id, Some("COURIER-1".to_string()));
    assert_eq!(movement_state.vehicle_id, Some("VEHICLE-1".to_string()));

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.status, BatchStatus::InTransit);
    assert_eq!(batch_state.movement_count, 1);

    // Leg 2: warehouse stop, no courier/vehicle.
    let movement_1 = movement_pda(batch, 1);
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            courier_id: None,
            vehicle_id: None,
            from_location: "Transit Hub".to_string(),
            to_location: "Central Warehouse".to_string(),
        }
        .data(),
        supply_chain_web3::accounts::LogMovement {
            carrier: carrier.pubkey(),
            role_assignment: carrier_role,
            batch,
            movement: movement_1,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.movement_count, 2);
}

#[test]
fn test_log_movement_rejects_wrong_role() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [4u8; 16]);

    // `source` was never assigned the Carrier role.
    let program_id = supply_chain_web3::id();
    let source_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let movement_0 = movement_pda(batch, 0);
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            courier_id: Some("COURIER-1".to_string()),
            vehicle_id: Some("VEHICLE-1".to_string()),
            from_location: "A".to_string(),
            to_location: "B".to_string(),
        }
        .data(),
        supply_chain_web3::accounts::LogMovement {
            carrier: source.pubkey(),
            role_assignment: source_role,
            batch,
            movement: movement_0,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_log_movement_rejects_mismatched_courier_vehicle() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [5u8; 16]);

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, carrier.pubkey(), Role::Carrier);

    let program_id = supply_chain_web3::id();
    let carrier_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let movement_0 = movement_pda(batch, 0);
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            courier_id: Some("COURIER-1".to_string()),
            vehicle_id: None,
            from_location: "A".to_string(),
            to_location: "B".to_string(),
        }
        .data(),
        supply_chain_web3::accounts::LogMovement {
            carrier: carrier.pubkey(),
            role_assignment: carrier_role,
            batch,
            movement: movement_0,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `anchor test`
Expected: FAIL to compile — `LogMovement`, `Movement`, `constants::MOVEMENT_SEED` don't exist yet.

- [ ] **Step 3: Append to `constants.rs`**

```rust

#[constant]
pub const MOVEMENT_SEED: &[u8] = b"movement";

#[constant]
pub const MAX_LOCATION_LEN: usize = 64;

#[constant]
pub const MAX_ID_LEN: usize = 32;
```

- [ ] **Step 4: Append to `state.rs`**

```rust

#[account]
#[derive(InitSpace)]
pub struct Movement {
    pub batch: Pubkey,
    pub carrier: Pubkey,
    #[max_len(MAX_ID_LEN)]
    pub courier_id: Option<String>,
    #[max_len(MAX_ID_LEN)]
    pub vehicle_id: Option<String>,
    #[max_len(MAX_LOCATION_LEN)]
    pub from_location: String,
    #[max_len(MAX_LOCATION_LEN)]
    pub to_location: String,
    pub timestamp: i64,
}
```

- [ ] **Step 5: Append to `error.rs`**

Insert these two variants inside the existing `ErrorCode` enum body, after `StringTooLong`:

```rust

    #[msg("Batch has already been delivered")]
    InvalidStatusTransition,
    #[msg("courier_id and vehicle_id must both be set or both be empty")]
    InvalidMovementInput,
```

- [ ] **Step 6: Create `instructions/log_movement.rs`**

```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Batch, BatchStatus, Movement, Role, RoleAssignment},
};

#[derive(Accounts)]
pub struct LogMovement<'info> {
    #[account(mut)]
    pub carrier: Signer<'info>,
    #[account(seeds = [ROLE_SEED, carrier.key().as_ref()], bump)]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub batch: Account<'info, Batch>,
    #[account(
        init,
        payer = carrier,
        space = 8 + Movement::INIT_SPACE,
        seeds = [MOVEMENT_SEED, batch.key().as_ref(), &batch.movement_count.to_le_bytes()],
        bump
    )]
    pub movement: Account<'info, Movement>,
    pub system_program: Program<'info, System>,
}

pub fn handle_log_movement(
    ctx: Context<LogMovement>,
    courier_id: Option<String>,
    vehicle_id: Option<String>,
    from_location: String,
    to_location: String,
) -> Result<()> {
    require!(
        ctx.accounts.role_assignment.role == Role::Carrier,
        ErrorCode::Unauthorized,
    );
    require!(
        ctx.accounts.batch.status != BatchStatus::Delivered,
        ErrorCode::InvalidStatusTransition,
    );
    require!(
        courier_id.is_some() == vehicle_id.is_some(),
        ErrorCode::InvalidMovementInput,
    );
    require!(
        from_location.len() <= MAX_LOCATION_LEN && to_location.len() <= MAX_LOCATION_LEN,
        ErrorCode::StringTooLong,
    );
    if let Some(ref id) = courier_id {
        require!(id.len() <= MAX_ID_LEN, ErrorCode::StringTooLong);
    }
    if let Some(ref id) = vehicle_id {
        require!(id.len() <= MAX_ID_LEN, ErrorCode::StringTooLong);
    }

    let movement = &mut ctx.accounts.movement;
    movement.batch = ctx.accounts.batch.key();
    movement.carrier = ctx.accounts.carrier.key();
    movement.courier_id = courier_id;
    movement.vehicle_id = vehicle_id;
    movement.from_location = from_location;
    movement.to_location = to_location;
    movement.timestamp = Clock::get()?.unix_timestamp;

    ctx.accounts.batch.movement_count += 1;
    ctx.accounts.batch.status = BatchStatus::InTransit;
    Ok(())
}
```

- [ ] **Step 7: Add module to `instructions.rs`**

Replace contents with:

```rust
pub mod assign_role;
pub mod initialize_config;
pub mod log_movement;
pub mod register_batch;

pub use assign_role::*;
pub use initialize_config::*;
pub use log_movement::*;
pub use register_batch::*;
```

- [ ] **Step 8: Add instruction to `lib.rs`**

Inside `pub mod supply_chain_web3 { ... }`, after `register_batch`, add:

```rust

    pub fn log_movement(
        ctx: Context<LogMovement>,
        courier_id: Option<String>,
        vehicle_id: Option<String>,
        from_location: String,
        to_location: String,
    ) -> Result<()> {
        crate::instructions::log_movement::handle_log_movement(
            ctx,
            courier_id,
            vehicle_id,
            from_location,
            to_location,
        )
    }
```

- [ ] **Step 9: Run test to verify it passes**

Run: `anchor test`
Expected: all three tests in `test_log_movement.rs` PASS (plus all prior tasks' tests still passing).

- [ ] **Step 10: Commit**

```bash
git add programs/supply-chain-web3/src/constants.rs \
  programs/supply-chain-web3/src/state.rs \
  programs/supply-chain-web3/src/error.rs \
  programs/supply-chain-web3/src/instructions.rs \
  programs/supply-chain-web3/src/instructions/log_movement.rs \
  programs/supply-chain-web3/src/lib.rs \
  programs/supply-chain-web3/tests/test_log_movement.rs
git commit -m "feat: add log_movement instruction"
```

---

## Task 4: Restaurant receipt

**Files:**
- Create: `programs/supply-chain-web3/src/instructions/receive_at_restaurant.rs`
- Modify: `programs/supply-chain-web3/src/instructions.rs` (add module)
- Modify: `programs/supply-chain-web3/src/lib.rs` (add instruction)
- Test: `programs/supply-chain-web3/tests/test_receive_at_restaurant.rs`

**Interfaces:**
- Consumes: `constants::ROLE_SEED` (Task 1), `state::{Role, RoleAssignment, Batch, BatchStatus}` (Tasks 1-2), `error::ErrorCode::{Unauthorized, InvalidStatusTransition}` (Tasks 1, 3), `instruction::LogMovement`/`accounts::LogMovement` (Task 3, reused in the post-delivery rejection test).
- Produces: instruction `receive_at_restaurant(ctx)` — no new state/constants/errors (all fields it writes were already defined on `Batch` in Task 2).

- [ ] **Step 1: Write the failing test**

Create `programs/supply-chain-web3/tests/test_receive_at_restaurant.rs`:

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
    supply_chain_web3::state::{Batch, BatchStatus, Role, SourceType},
};

fn new_svm_with_admin() -> (LiteSVM, Keypair) {
    let admin = Keypair::new();
    let mut svm = LiteSVM::new();
    let bytes = include_bytes!(concat!(
        env!("CARGO_TARGET_TMPDIR"),
        "/../deploy/supply_chain_web3.so"
    ));
    svm.add_program(supply_chain_web3::id(), bytes).unwrap();
    svm.airdrop(&admin.pubkey(), 1_000_000_000).unwrap();
    (svm, admin)
}

fn init_config(svm: &mut LiteSVM, admin: &Keypair) -> Pubkey {
    let program_id = supply_chain_web3::id();
    let config =
        Pubkey::find_program_address(&[supply_chain_web3::constants::CONFIG_SEED], &program_id).0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::InitializeConfig {}.data(),
        supply_chain_web3::accounts::InitializeConfig {
            admin: admin.pubkey(),
            config,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    config
}

fn assign_role(svm: &mut LiteSVM, admin: &Keypair, config: Pubkey, wallet: Pubkey, role: Role) {
    let program_id = supply_chain_web3::id();
    let role_assignment = Pubkey::find_program_address(
        &[supply_chain_web3::constants::ROLE_SEED, wallet.as_ref()],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::AssignRole { wallet, role }.data(),
        supply_chain_web3::accounts::AssignRole {
            admin: admin.pubkey(),
            config,
            role_assignment,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
}

fn register_batch(svm: &mut LiteSVM, source: &Keypair, batch_id: [u8; 16]) -> Pubkey {
    let program_id = supply_chain_web3::id();
    let batch = Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &program_id,
    )
    .0;
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "Basil".to_string(),
            quantity: 5,
            source_type: SourceType::Farmer,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source: source.pubkey(),
            role_assignment,
            batch,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[source]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());
    batch
}

fn receive_ix(restaurant: Pubkey, role_assignment: Pubkey, batch: Pubkey) -> Instruction {
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::ReceiveAtRestaurant {}.data(),
        supply_chain_web3::accounts::ReceiveAtRestaurant {
            restaurant,
            role_assignment,
            batch,
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_receive_at_restaurant_happy_path() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [8u8; 16]);

    let restaurant = Keypair::new();
    svm.airdrop(&restaurant.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, restaurant.pubkey(), Role::Restaurant);
    let program_id = supply_chain_web3::id();
    let restaurant_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            restaurant.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = receive_ix(restaurant.pubkey(), restaurant_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&restaurant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&restaurant]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok());

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.status, BatchStatus::Delivered);
    assert_eq!(batch_state.received_by, restaurant.pubkey());
    assert!(batch_state.delivered_at > 0);
}

#[test]
fn test_receive_at_restaurant_rejects_wrong_role() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [9u8; 16]);

    // `source` was never assigned the Restaurant role.
    let program_id = supply_chain_web3::id();
    let source_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = receive_ix(source.pubkey(), source_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_receive_at_restaurant_rejects_double_receive() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [10u8; 16]);

    let restaurant = Keypair::new();
    svm.airdrop(&restaurant.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, restaurant.pubkey(), Role::Restaurant);
    let program_id = supply_chain_web3::id();
    let restaurant_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            restaurant.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;

    let instruction = receive_ix(restaurant.pubkey(), restaurant_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&restaurant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&restaurant]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Second receipt on the same, already-delivered batch must fail.
    let instruction = receive_ix(restaurant.pubkey(), restaurant_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&restaurant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&restaurant]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}

#[test]
fn test_log_movement_rejects_after_delivered() {
    let (mut svm, admin) = new_svm_with_admin();
    let config = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, source.pubkey(), Role::Source);
    let batch = register_batch(&mut svm, &source, [11u8; 16]);

    let restaurant = Keypair::new();
    svm.airdrop(&restaurant.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, restaurant.pubkey(), Role::Restaurant);
    let program_id = supply_chain_web3::id();
    let restaurant_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            restaurant.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let instruction = receive_ix(restaurant.pubkey(), restaurant_role, batch);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&restaurant.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&restaurant]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    assign_role(&mut svm, &admin, config, carrier.pubkey(), Role::Carrier);
    let carrier_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &program_id,
    )
    .0;
    let movement_0 = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::MOVEMENT_SEED,
            batch.as_ref(),
            &0u32.to_le_bytes(),
        ],
        &program_id,
    )
    .0;
    let instruction = Instruction::new_with_bytes(
        program_id,
        &supply_chain_web3::instruction::LogMovement {
            courier_id: None,
            vehicle_id: None,
            from_location: "Restaurant".to_string(),
            to_location: "Kitchen".to_string(),
        }
        .data(),
        supply_chain_web3::accounts::LogMovement {
            carrier: carrier.pubkey(),
            role_assignment: carrier_role,
            batch,
            movement: movement_0,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_err());
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `anchor test`
Expected: FAIL to compile — `ReceiveAtRestaurant` doesn't exist yet.

- [ ] **Step 3: Create `instructions/receive_at_restaurant.rs`**

```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Batch, BatchStatus, Role, RoleAssignment},
};

#[derive(Accounts)]
pub struct ReceiveAtRestaurant<'info> {
    pub restaurant: Signer<'info>,
    #[account(seeds = [ROLE_SEED, restaurant.key().as_ref()], bump)]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(mut)]
    pub batch: Account<'info, Batch>,
}

pub fn handle_receive_at_restaurant(ctx: Context<ReceiveAtRestaurant>) -> Result<()> {
    require!(
        ctx.accounts.role_assignment.role == Role::Restaurant,
        ErrorCode::Unauthorized,
    );
    require!(
        ctx.accounts.batch.status != BatchStatus::Delivered,
        ErrorCode::InvalidStatusTransition,
    );

    let batch = &mut ctx.accounts.batch;
    batch.status = BatchStatus::Delivered;
    batch.received_by = ctx.accounts.restaurant.key();
    batch.delivered_at = Clock::get()?.unix_timestamp;
    Ok(())
}
```

- [ ] **Step 4: Add module to `instructions.rs`**

Replace contents with:

```rust
pub mod assign_role;
pub mod initialize_config;
pub mod log_movement;
pub mod receive_at_restaurant;
pub mod register_batch;

pub use assign_role::*;
pub use initialize_config::*;
pub use log_movement::*;
pub use receive_at_restaurant::*;
pub use register_batch::*;
```

- [ ] **Step 5: Add instruction to `lib.rs`**

Inside `pub mod supply_chain_web3 { ... }`, after `log_movement`, add:

```rust

    pub fn receive_at_restaurant(ctx: Context<ReceiveAtRestaurant>) -> Result<()> {
        crate::instructions::receive_at_restaurant::handle_receive_at_restaurant(ctx)
    }
```

- [ ] **Step 6: Run test to verify it passes**

Run: `anchor test`
Expected: all four tests in `test_receive_at_restaurant.rs` PASS, and the full suite (Tasks 1-4) passes.

- [ ] **Step 7: Commit**

```bash
git add programs/supply-chain-web3/src/instructions.rs \
  programs/supply-chain-web3/src/instructions/receive_at_restaurant.rs \
  programs/supply-chain-web3/src/lib.rs \
  programs/supply-chain-web3/tests/test_receive_at_restaurant.rs
git commit -m "feat: add receive_at_restaurant instruction"
```
