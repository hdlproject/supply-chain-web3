# Multi-Product Batches Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a batch carry one or more products, each referencing a shared, reusable SKU catalog, instead of exactly one free-text ingredient name.

**Architecture:** Two new on-chain account types (`Product`, a shared catalog keyed by SKU code; `LineItem`, one per product-in-a-batch) plus a reworked `Batch` (drops its single product fields, gains a declared item count) and a new `add_line_item` instruction. A client builds one atomic transaction per batch: `register_batch` + `register_product` for any new SKU + `add_line_item` once per product.

**Tech Stack:** Anchor/Rust (program), litesvm (Rust integration tests), Next.js 16/React 19 (frontend), `@coral-xyz/anchor` TS client, Vitest.

**Spec:** [prd/v5_multi_product_batches.md](../../../prd/v5_multi_product_batches.md)

## Global Constraints

- Build the program with `cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2` — never `anchor build` (produces a `.so` litesvm rejects in this environment).
- Run Rust tests with `cargo test` from the repo root after that build — never `anchor test`.
- This is a breaking on-chain layout change. There is no migration path — the final task's acceptance test requires a fresh `--reset` + redeploy + re-provision, same as every prior schema change in this project's history.
- Frontend verification is `cd app && npm run build && npm run lint && npm run test` — all three clean, every task.
- Every write-action's generated client call auto-resolves PDA accounts from instruction args (seeds-derived accounts are never passed explicitly) — this project's established pattern throughout; keep using it.

---

### Task 1: `Product` account and the idempotent `register_product` instruction

**Files:**
- Modify: `programs/supply-chain-web3/src/constants.rs`
- Modify: `programs/supply-chain-web3/src/state.rs`
- Create: `programs/supply-chain-web3/src/instructions/register_product.rs`
- Modify: `programs/supply-chain-web3/src/instructions.rs`
- Modify: `programs/supply-chain-web3/src/lib.rs`
- Create: `programs/supply-chain-web3/tests/test_products.rs`

**Interfaces:**
- Consumes: nothing new — only `RoleAssignment` (existing, from `state.rs`) and `ErrorCode::Unauthorized`/`ErrorCode::StringTooLong` (existing, from `error.rs`).
- Produces: `Product { sku_code: String, name: String }`, PDA `seeds = [PRODUCT_SEED, sku_code.as_bytes()]`. Instruction `register_product(sku_code: String, name: String)`. Task 2 derives `LineItem.product` from this same PDA via the same `sku_code`-keyed auto-resolution.

- [ ] **Step 1: Add the new constant and seed**

In `programs/supply-chain-web3/src/constants.rs`, add after the existing `MAX_ID_LEN` line:

```rust
#[constant]
pub const PRODUCT_SEED: &[u8] = b"product";

pub const MAX_SKU_CODE_LEN: usize = 32;
```

- [ ] **Step 2: Add the `Product` account struct**

In `programs/supply-chain-web3/src/state.rs`, add after the `RoleAssignment` struct (before the `SourceType` enum):

```rust
#[account]
#[derive(InitSpace)]
pub struct Product {
    #[max_len(MAX_SKU_CODE_LEN)]
    pub sku_code: String,
    #[max_len(MAX_INGREDIENT_NAME_LEN)]
    pub name: String,
}
```

- [ ] **Step 3: Write the failing tests**

Create `programs/supply-chain-web3/tests/test_products.rs`:

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
    supply_chain_web3::state::{Product, Role},
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

fn product_pda(sku_code: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::PRODUCT_SEED,
            sku_code.as_bytes(),
        ],
        &supply_chain_web3::id(),
    )
    .0
}

fn register_product_ix(
    registrant: Pubkey,
    role_assignment: Pubkey,
    sku_code: &str,
    name: &str,
) -> Instruction {
    let product = product_pda(sku_code);
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::RegisterProduct {
            sku_code: sku_code.to_string(),
            name: name.to_string(),
        }
        .data(),
        supply_chain_web3::accounts::RegisterProduct {
            registrant,
            role_assignment,
            product,
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_register_product_happy_path() {
    let (mut svm, admin) = new_svm_with_payer();
    let admin_role = init_config(&mut svm, &admin);

    let instruction =
        register_product_ix(admin.pubkey(), admin_role, "TOMATO-ROMA-1KG", "Roma Tomatoes 1kg");
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let product_account = svm.get_account(&product_pda("TOMATO-ROMA-1KG")).unwrap();
    let mut data: &[u8] = &product_account.data;
    let product = Product::try_deserialize(&mut data).unwrap();
    assert_eq!(product.sku_code, "TOMATO-ROMA-1KG");
    assert_eq!(product.name, "Roma Tomatoes 1kg");
}

#[test]
fn test_register_product_is_idempotent() {
    let (mut svm, admin) = new_svm_with_payer();
    let admin_role = init_config(&mut svm, &admin);

    let first =
        register_product_ix(admin.pubkey(), admin_role, "TOMATO-ROMA-1KG", "Roma Tomatoes 1kg");
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[first], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // Second call for the SAME code, with a DIFFERENT name, must still
    // succeed (not reject) -- and must NOT overwrite the original name.
    svm.expire_blockhash();
    let second = register_product_ix(admin.pubkey(), admin_role, "TOMATO-ROMA-1KG", "Something Else");
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[second], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let product_account = svm.get_account(&product_pda("TOMATO-ROMA-1KG")).unwrap();
    let mut data: &[u8] = &product_account.data;
    let product = Product::try_deserialize(&mut data).unwrap();
    assert_eq!(product.name, "Roma Tomatoes 1kg", "first registration's name must stick");
}

#[test]
fn test_register_product_rejects_name_too_long() {
    let (mut svm, admin) = new_svm_with_payer();
    let admin_role = init_config(&mut svm, &admin);

    let instruction = register_product_ix(admin.pubkey(), admin_role, "LONG-NAME-SKU", &"x".repeat(65));
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

#[test]
fn test_register_product_rejects_role_less_wallet() {
    let (mut svm, _admin) = new_svm_with_payer();
    let stranger = Keypair::new();
    svm.airdrop(&stranger.pubkey(), 1_000_000_000).unwrap();
    let stranger_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            stranger.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    // stranger_role was never created via grant_role, so this account
    // simply doesn't exist yet -- the same "missing RoleAssignment reads
    // as Unauthorized" design decision already established project-wide
    // (see prd/v1_basic_functionality.md's Errors section).
    let instruction = register_product_ix(stranger.pubkey(), stranger_role, "ANY-SKU", "Anything");
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&stranger.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&stranger]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from repo root): `cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2 2>&1 | tail -20` — expect a compile error (`register_product` instruction/accounts don't exist yet).

- [ ] **Step 3: Implement `register_product`**

Create `programs/supply-chain-web3/src/instructions/register_product.rs`:

```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Product, RoleAssignment},
};

#[derive(Accounts)]
#[instruction(sku_code: String, name: String)]
pub struct RegisterProduct<'info> {
    #[account(mut)]
    pub registrant: Signer<'info>,
    #[account(seeds = [ROLE_SEED, registrant.key().as_ref()], bump)]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(
        init_if_needed,
        payer = registrant,
        space = 8 + Product::INIT_SPACE,
        seeds = [PRODUCT_SEED, sku_code.as_bytes()],
        bump,
    )]
    pub product: Account<'info, Product>,
    pub system_program: Program<'info, System>,
}

pub fn handle_register_product(
    ctx: Context<RegisterProduct>,
    sku_code: String,
    name: String,
) -> Result<()> {
    let r = &ctx.accounts.role_assignment;
    require!(
        r.is_admin || r.is_source || r.is_carrier || r.is_restaurant,
        ErrorCode::Unauthorized,
    );

    // init_if_needed re-runs this handler even when the account already
    // existed -- only write fields on genuine first creation (detected
    // via the zero-initialized default), so a later caller passing a
    // different name for the same code can't silently rename an existing
    // SKU, and a too-long name on an already-registered code can't fail
    // a call that was only ever going to be a no-op anyway.
    let product = &mut ctx.accounts.product;
    if product.sku_code.is_empty() {
        require!(name.len() <= MAX_INGREDIENT_NAME_LEN, ErrorCode::StringTooLong);
        product.sku_code = sku_code;
        product.name = name;
    }
    Ok(())
}
```

In `programs/supply-chain-web3/src/instructions.rs`, add (keep alphabetical):

```rust
pub mod register_product;
```
and
```rust
pub use register_product::*;
```

In `programs/supply-chain-web3/src/lib.rs`, add inside the `#[program] pub mod supply_chain_web3 { ... }` block (after `revoke_role`, before `register_batch`):

```rust
    pub fn register_product(ctx: Context<RegisterProduct>, sku_code: String, name: String) -> Result<()> {
        crate::instructions::register_product::handle_register_product(ctx, sku_code, name)
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2 && cd .. && cargo test`
Expected: all 4 new tests pass, no existing test broken (this task doesn't touch `Batch`/`RegisterBatch` at all).

- [ ] **Step 5: Commit**

```bash
git add programs/supply-chain-web3/src/constants.rs programs/supply-chain-web3/src/state.rs programs/supply-chain-web3/src/instructions/register_product.rs programs/supply-chain-web3/src/instructions.rs programs/supply-chain-web3/src/lib.rs programs/supply-chain-web3/tests/test_products.rs
git commit -m "feat: add shared Product catalog with idempotent register_product"
```

---

### Task 2: `Batch`/`LineItem` rework, `add_line_item`, and fixing the cascade

**Files:**
- Modify: `programs/supply-chain-web3/src/constants.rs`
- Modify: `programs/supply-chain-web3/src/state.rs`
- Modify: `programs/supply-chain-web3/src/error.rs`
- Modify: `programs/supply-chain-web3/src/instructions/register_batch.rs`
- Create: `programs/supply-chain-web3/src/instructions/add_line_item.rs`
- Modify: `programs/supply-chain-web3/src/instructions.rs`
- Modify: `programs/supply-chain-web3/src/lib.rs`
- Modify: `programs/supply-chain-web3/tests/test_register_batch.rs`
- Modify: `programs/supply-chain-web3/tests/test_log_movement.rs`
- Modify: `programs/supply-chain-web3/tests/test_receive_at_restaurant.rs`

**Interfaces:**
- Consumes: `Product` + `PRODUCT_SEED` (Task 1).
- Produces: `LineItem { batch, index, product, quantity }`, PDA `seeds = [LINE_ITEM_SEED, batch.key().as_ref(), index.to_le_bytes().as_ref()]`. `register_batch(batch_id, source_type, line_item_count)` (signature changed — `ingredient_name`/`quantity` removed). `add_line_item(index, sku_code, quantity)`. Task 4-6 (frontend) consume these exact signatures and the `Batch.lineItemCount` / dropped `ingredientName`/`quantity` fields.

**Why this task also touches `test_log_movement.rs`/`test_receive_at_restaurant.rs`:** both have their own local `register_batch` helper calling the `RegisterBatch` instruction directly with the old `ingredient_name`/`quantity` args. Rust compiles the whole crate as one unit — those two files will not compile once this task's signature change lands, the same structural issue the v4 plan hit on its own Task 1. Fixing both is mechanical (drop the two removed fields, add `line_item_count: 0` — neither test file cares about products at all) and is part of this task's own definition of done, not a surprise to defer.

- [ ] **Step 1: Add the new constant, error variant, and `LineItem` struct**

In `programs/supply-chain-web3/src/constants.rs`, add:

```rust
#[constant]
pub const LINE_ITEM_SEED: &[u8] = b"line_item";
```

In `programs/supply-chain-web3/src/error.rs`, add a new variant:

```rust
    #[msg("Line item index is not less than the batch's declared line_item_count")]
    LineItemIndexOutOfRange,
```

In `programs/supply-chain-web3/src/state.rs`:
1. Remove `ingredient_name` and `quantity` from `Batch`, add `line_item_count`:

```rust
#[account]
#[derive(InitSpace)]
pub struct Batch {
    pub batch_id: [u8; 16],
    pub source_type: SourceType,
    pub source: Pubkey,
    pub status: BatchStatus,
    pub movement_count: u32,
    pub received_by: Pubkey,
    pub created_at: i64,
    pub delivered_at: i64,
    pub line_item_count: u16,
}
```

2. Add `LineItem` after `Batch` (before `Movement`):

```rust
#[account]
#[derive(InitSpace)]
pub struct LineItem {
    pub batch: Pubkey,
    pub index: u16,
    pub product: Pubkey,
    pub quantity: u64,
}
```

- [ ] **Step 2: Write the failing tests for `register_batch` + `add_line_item`**

Replace the entire contents of `programs/supply-chain-web3/tests/test_register_batch.rs` with:

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
    supply_chain_web3::state::{Batch, BatchStatus, LineItem, Role, SourceType},
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

fn product_pda(sku_code: &str) -> Pubkey {
    Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::PRODUCT_SEED,
            sku_code.as_bytes(),
        ],
        &supply_chain_web3::id(),
    )
    .0
}

fn register_product_ix(registrant: Pubkey, role_assignment: Pubkey, sku_code: &str, name: &str) -> Instruction {
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::RegisterProduct {
            sku_code: sku_code.to_string(),
            name: name.to_string(),
        }
        .data(),
        supply_chain_web3::accounts::RegisterProduct {
            registrant,
            role_assignment,
            product: product_pda(sku_code),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn batch_pda(batch_id: [u8; 16]) -> Pubkey {
    Pubkey::find_program_address(
        &[supply_chain_web3::constants::BATCH_SEED, batch_id.as_ref()],
        &supply_chain_web3::id(),
    )
    .0
}

fn register_batch_ix(
    source: Pubkey,
    role_assignment: Pubkey,
    batch_id: [u8; 16],
    source_type: SourceType,
    line_item_count: u16,
) -> Instruction {
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            source_type,
            line_item_count,
        }
        .data(),
        supply_chain_web3::accounts::RegisterBatch {
            source,
            role_assignment,
            batch: batch_pda(batch_id),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

fn line_item_pda(batch: Pubkey, index: u16) -> Pubkey {
    Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::LINE_ITEM_SEED,
            batch.as_ref(),
            &index.to_le_bytes(),
        ],
        &supply_chain_web3::id(),
    )
    .0
}

fn add_line_item_ix(
    source: Pubkey,
    role_assignment: Pubkey,
    batch: Pubkey,
    index: u16,
    sku_code: &str,
    quantity: u64,
) -> Instruction {
    Instruction::new_with_bytes(
        supply_chain_web3::id(),
        &supply_chain_web3::instruction::AddLineItem {
            index,
            sku_code: sku_code.to_string(),
            quantity,
        }
        .data(),
        supply_chain_web3::accounts::AddLineItem {
            source,
            role_assignment,
            batch,
            product: product_pda(sku_code),
            line_item: line_item_pda(batch, index),
            system_program: system_program::ID,
        }
        .to_account_metas(None),
    )
}

#[test]
fn test_register_batch_with_line_items_happy_path() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, source.pubkey(), Role::Source);
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let batch_id: [u8; 16] = [7u8; 16];
    let batch = batch_pda(batch_id);

    // One transaction: create the batch, register a new SKU, add two
    // line items (one referencing the brand-new SKU, one referencing an
    // already-existing one) -- exactly the atomic composition this
    // feature is built around.
    register_product_ix(admin.pubkey(), admin_role, "RICE-JASMINE-5KG", "Jasmine Rice 5kg");
    let blockhash = svm.latest_blockhash();
    let seed_product = register_product_ix(admin.pubkey(), admin_role, "RICE-JASMINE-5KG", "Jasmine Rice 5kg");
    let msg = Message::new_with_blockhash(&[seed_product], Some(&admin.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&admin]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    let instructions = vec![
        register_batch_ix(source.pubkey(), role_assignment, batch_id, SourceType::Farmer, 2),
        register_product_ix(source.pubkey(), role_assignment, "CHICKEN-BREAST-1KG", "Chicken Breast 1kg"),
        add_line_item_ix(source.pubkey(), role_assignment, batch, 0, "CHICKEN-BREAST-1KG", 50),
        add_line_item_ix(source.pubkey(), role_assignment, batch, 1, "RICE-JASMINE-5KG", 10),
    ];
    svm.expire_blockhash();
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&instructions, Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    let res = svm.send_transaction(tx);
    assert!(res.is_ok(), "{res:?}");

    let batch_account = svm.get_account(&batch).unwrap();
    let mut data: &[u8] = &batch_account.data;
    let batch_state = Batch::try_deserialize(&mut data).unwrap();
    assert_eq!(batch_state.batch_id, batch_id);
    assert_eq!(batch_state.source_type, SourceType::Farmer);
    assert_eq!(batch_state.source, source.pubkey());
    assert_eq!(batch_state.status, BatchStatus::Registered);
    assert_eq!(batch_state.line_item_count, 2);

    let item0_account = svm.get_account(&line_item_pda(batch, 0)).unwrap();
    let mut data: &[u8] = &item0_account.data;
    let item0 = LineItem::try_deserialize(&mut data).unwrap();
    assert_eq!(item0.batch, batch);
    assert_eq!(item0.index, 0);
    assert_eq!(item0.product, product_pda("CHICKEN-BREAST-1KG"));
    assert_eq!(item0.quantity, 50);

    let item1_account = svm.get_account(&line_item_pda(batch, 1)).unwrap();
    let mut data: &[u8] = &item1_account.data;
    let item1 = LineItem::try_deserialize(&mut data).unwrap();
    assert_eq!(item1.product, product_pda("RICE-JASMINE-5KG"));
    assert_eq!(item1.quantity, 10);
}

#[test]
fn test_register_batch_rejects_wrong_role() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let carrier = Keypair::new();
    svm.airdrop(&carrier.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, carrier.pubkey(), Role::Carrier);
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            carrier.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let batch_id: [u8; 16] = [1u8; 16];
    let instruction =
        register_batch_ix(carrier.pubkey(), role_assignment, batch_id, SourceType::Supermarket, 0);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&carrier.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&carrier]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

#[test]
fn test_add_line_item_rejects_index_out_of_range() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let source = Keypair::new();
    svm.airdrop(&source.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, source.pubkey(), Role::Source);
    let role_assignment = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            source.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let batch_id: [u8; 16] = [3u8; 16];
    let batch = batch_pda(batch_id);
    let instructions = vec![
        register_batch_ix(source.pubkey(), role_assignment, batch_id, SourceType::Farmer, 1),
        register_product_ix(source.pubkey(), role_assignment, "ONLY-ONE-SLOT", "Only One Slot"),
    ];
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&instructions, Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // line_item_count is 1 -- index 1 is out of range.
    svm.expire_blockhash();
    let instruction =
        add_line_item_ix(source.pubkey(), role_assignment, batch, 1, "ONLY-ONE-SLOT", 5);
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&source.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&source]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}

#[test]
fn test_add_line_item_rejects_non_owner() {
    let (mut svm, admin) = new_svm_with_admin();
    let admin_role = init_config(&mut svm, &admin);

    let owner = Keypair::new();
    svm.airdrop(&owner.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, owner.pubkey(), Role::Source);
    let owner_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            owner.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let impostor = Keypair::new();
    svm.airdrop(&impostor.pubkey(), 1_000_000_000).unwrap();
    grant_role(&mut svm, &admin, admin_role, impostor.pubkey(), Role::Source);
    let impostor_role = Pubkey::find_program_address(
        &[
            supply_chain_web3::constants::ROLE_SEED,
            impostor.pubkey().as_ref(),
        ],
        &supply_chain_web3::id(),
    )
    .0;

    let batch_id: [u8; 16] = [4u8; 16];
    let batch = batch_pda(batch_id);
    let instructions = vec![
        register_batch_ix(owner.pubkey(), owner_role, batch_id, SourceType::Farmer, 1),
        register_product_ix(owner.pubkey(), owner_role, "SOMEONE-ELSES-SKU", "Someone Else's SKU"),
    ];
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&instructions, Some(&owner.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&owner]).unwrap();
    assert!(svm.send_transaction(tx).is_ok());

    // impostor holds Source too, but doesn't own this batch -- has_one
    // on the batch account must reject this regardless of role.
    svm.expire_blockhash();
    let instruction = add_line_item_ix(
        impostor.pubkey(),
        impostor_role,
        batch,
        0,
        "SOMEONE-ELSES-SKU",
        1,
    );
    let blockhash = svm.latest_blockhash();
    let msg = Message::new_with_blockhash(&[instruction], Some(&impostor.pubkey()), &blockhash);
    let tx = VersionedTransaction::try_new(VersionedMessage::Legacy(msg), &[&impostor]).unwrap();
    assert!(svm.send_transaction(tx).is_err());
}
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2 2>&1 | tail -30` — expect compile errors (`RegisterBatch`'s old field names, `AddLineItem` doesn't exist, `Batch.line_item_count` doesn't exist).

- [ ] **Step 3: Rework `register_batch` and add `add_line_item`**

Replace `programs/supply-chain-web3/src/instructions/register_batch.rs`'s handler (keep the `Accounts` struct exactly as-is — no account changes, only args):

```rust
pub fn handle_register_batch(
    ctx: Context<RegisterBatch>,
    batch_id: [u8; 16],
    source_type: SourceType,
    line_item_count: u16,
) -> Result<()> {
    require!(
        ctx.accounts.role_assignment.is_source,
        ErrorCode::Unauthorized,
    );

    let batch = &mut ctx.accounts.batch;
    batch.batch_id = batch_id;
    batch.source_type = source_type;
    batch.source = ctx.accounts.source.key();
    batch.status = BatchStatus::Registered;
    batch.movement_count = 0;
    batch.received_by = Pubkey::default();
    batch.created_at = Clock::get()?.unix_timestamp;
    batch.delivered_at = 0;
    batch.line_item_count = line_item_count;
    Ok(())
}
```

(Drop the `ingredient_name`/`quantity` params and the `ingredient_name.len() <= MAX_INGREDIENT_NAME_LEN` check — that validation now lives in `register_product`.)

Create `programs/supply-chain-web3/src/instructions/add_line_item.rs`:

```rust
use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Batch, LineItem, Product, RoleAssignment},
};

#[derive(Accounts)]
#[instruction(index: u16, sku_code: String, quantity: u64)]
pub struct AddLineItem<'info> {
    #[account(mut)]
    pub source: Signer<'info>,
    #[account(seeds = [ROLE_SEED, source.key().as_ref()], bump)]
    pub role_assignment: Account<'info, RoleAssignment>,
    #[account(mut, has_one = source)]
    pub batch: Account<'info, Batch>,
    #[account(seeds = [PRODUCT_SEED, sku_code.as_bytes()], bump)]
    pub product: Account<'info, Product>,
    #[account(
        init,
        payer = source,
        space = 8 + LineItem::INIT_SPACE,
        seeds = [LINE_ITEM_SEED, batch.key().as_ref(), &index.to_le_bytes()],
        bump,
    )]
    pub line_item: Account<'info, LineItem>,
    pub system_program: Program<'info, System>,
}

pub fn handle_add_line_item(
    ctx: Context<AddLineItem>,
    index: u16,
    _sku_code: String,
    quantity: u64,
) -> Result<()> {
    require!(
        ctx.accounts.role_assignment.is_source,
        ErrorCode::Unauthorized,
    );
    require!(
        index < ctx.accounts.batch.line_item_count,
        ErrorCode::LineItemIndexOutOfRange,
    );

    let line_item = &mut ctx.accounts.line_item;
    line_item.batch = ctx.accounts.batch.key();
    line_item.index = index;
    line_item.product = ctx.accounts.product.key();
    line_item.quantity = quantity;
    Ok(())
}
```

In `programs/supply-chain-web3/src/instructions.rs`, add:
```rust
pub mod add_line_item;
```
and
```rust
pub use add_line_item::*;
```

In `programs/supply-chain-web3/src/lib.rs`:
1. Update the `register_batch` entrypoint:

```rust
    pub fn register_batch(
        ctx: Context<RegisterBatch>,
        batch_id: [u8; 16],
        source_type: SourceType,
        line_item_count: u16,
    ) -> Result<()> {
        crate::instructions::register_batch::handle_register_batch(
            ctx,
            batch_id,
            source_type,
            line_item_count,
        )
    }
```

2. Add a new entrypoint (after `register_batch`):

```rust
    pub fn add_line_item(
        ctx: Context<AddLineItem>,
        index: u16,
        sku_code: String,
        quantity: u64,
    ) -> Result<()> {
        crate::instructions::add_line_item::handle_add_line_item(ctx, index, sku_code, quantity)
    }
```

- [ ] **Step 4: Fix the two cascaded test files**

In `programs/supply-chain-web3/tests/test_log_movement.rs`, in the local `register_batch` helper, replace:

```rust
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "Tomatoes".to_string(),
            quantity: 20,
            source_type: SourceType::TraditionalMarket,
        }
```
with:
```rust
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            source_type: SourceType::TraditionalMarket,
            line_item_count: 0,
        }
```

In `programs/supply-chain-web3/tests/test_receive_at_restaurant.rs`, in its own local `register_batch` helper, replace:

```rust
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            ingredient_name: "Basil".to_string(),
            quantity: 5,
            source_type: SourceType::Farmer,
        }
```
with:
```rust
        &supply_chain_web3::instruction::RegisterBatch {
            batch_id,
            source_type: SourceType::Farmer,
            line_item_count: 0,
        }
```

Neither test file otherwise changes — they never asserted on `ingredient_name`/`quantity`, only on movement/delivery behavior.

- [ ] **Step 5: Run the full test suite and clippy**

Run: `cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2 && cd .. && cargo test && cargo clippy --all-targets -- -D warnings`
Expected: all tests pass (4 from Task 1 + 3 new here + the unchanged movement/receive suites), zero clippy warnings.

- [ ] **Step 6: Commit**

```bash
git add programs/supply-chain-web3/src/constants.rs programs/supply-chain-web3/src/state.rs programs/supply-chain-web3/src/error.rs programs/supply-chain-web3/src/instructions/register_batch.rs programs/supply-chain-web3/src/instructions/add_line_item.rs programs/supply-chain-web3/src/instructions.rs programs/supply-chain-web3/src/lib.rs programs/supply-chain-web3/tests/test_register_batch.rs programs/supply-chain-web3/tests/test_log_movement.rs programs/supply-chain-web3/tests/test_receive_at_restaurant.rs
git commit -m "feat: batches carry multiple line items referencing the Product catalog"
```

---

### Task 3: Regenerate IDL; frontend read helpers for `Product`/`LineItem`

**Files:**
- Regenerate: `app/src/idl/supply_chain_web3.json`, `app/src/idl/supply_chain_web3.ts`, `app/src/idl/supply_chain_web3_errors.ts` (via `make idl`)
- Modify: `app/src/lib/program.ts`
- Modify: `app/src/lib/accounts.ts`

**Interfaces:**
- Consumes: the regenerated IDL's `product`/`lineItem` account types and `registerProduct`/`addLineItem`/`registerBatch` methods (Tasks 1-2).
- Produces: `productPda(skuCode)`, `fetchProduct(skuCode)`, `fetchAllProducts()`, `fetchLineItemsForBatch(batch)`. Tasks 4-6 (frontend UI) consume these exact names.

- [ ] **Step 1: Regenerate the IDL**

Run (from repo root): `make idl`
Expected: succeeds; `grep -c registerProduct app/src/idl/supply_chain_web3.json` and `grep -c addLineItem app/src/idl/supply_chain_web3.json` both print a number > 0.

- [ ] **Step 2: Add `productPda` to `lib/program.ts`**

In `app/src/lib/program.ts`, add the seed constant alongside the existing ones:

```ts
const PRODUCT_SEED = Buffer.from("product");
```

Add the PDA helper after `movementPda`:

```ts
export function productPda(
  skuCode: string,
  programId: PublicKey = getProgramId(),
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([PRODUCT_SEED, Buffer.from(skuCode)], programId);
}
```

- [ ] **Step 3: Add the read helpers to `lib/accounts.ts`**

In `app/src/lib/accounts.ts`, add:

```ts
import { batchPda, configPda, getReadProgram, productPda, roleAssignmentPda } from "./program";
```
(replacing the existing import line that lists `batchPda, configPda, getReadProgram, roleAssignmentPda`.)

Add after `fetchBatch`/`BatchAccountDecoded`:

```ts
export async function fetchProduct(skuCode: string) {
  const program = getReadProgram();
  const [pda] = productPda(skuCode);
  return program.account.product.fetchNullable(pda);
}

export async function fetchAllProducts() {
  const program = getReadProgram();
  return program.account.product.all();
}

export type ProductEntry = Awaited<ReturnType<typeof fetchAllProducts>>[number];
```

Add after `fetchMovementsForBatch`/`MovementRecord` (mirrors that function's memcmp pattern — `LineItem.batch` is the first field after the 8-byte discriminator, same offset):

```ts
export async function fetchLineItemsForBatch(batch: PublicKey) {
  const program = getReadProgram();
  const entries = await program.account.lineItem.all([
    { memcmp: { offset: 8, bytes: batch.toBase58() } },
  ]);
  return entries.map((entry) => entry.account).sort((a, b) => a.index - b.index);
}

export type LineItemRecord = Awaited<ReturnType<typeof fetchLineItemsForBatch>>[number];
```

- [ ] **Step 4: Verify**

Run: `cd app && npm run build && npm run lint && npm run test`
Expected: clean build (confirms the IDL's generated types match these new functions exactly), clean lint, all existing tests still pass (this task adds no new tests — these are thin wrappers around already-covered Anchor client calls, matching this project's existing convention of not unit-testing live-RPC-dependent code).

- [ ] **Step 5: Commit**

```bash
git add app/src/idl app/src/lib/program.ts app/src/lib/accounts.ts
git commit -m "feat: regenerate IDL; add Product/LineItem read helpers"
```

---

### Task 4: Product catalog page

**Files:**
- Create: `app/src/app/products/page.tsx`
- Create: `app/src/app/products/RegisterProductForm.tsx`
- Create: `app/src/app/products/actions.ts`
- Modify: `app/src/components/NavBar.tsx`

**Interfaces:**
- Consumes: `fetchAllProducts` (Task 3), `requireSession` (existing, `lib/guard.ts`), `useWalletGatedAction` (existing, `lib/use-wallet-gated-action.ts`), `describeTxError` (existing, `lib/tx-error.ts`).
- Produces: `/products` route. Task 5's `RegisterBatchForm` reuses this task's product-list fetch shape (`ProductEntry[]`) for its own picker, but does not import this page's components directly — it fetches independently via `fetchAllProducts` client-side (Task 5 detail).

- [ ] **Step 1: Write `actions.ts`**

Create `app/src/app/products/actions.ts`:

```ts
"use client";

import { getProgramForWallet, type SigningWallet } from "@/lib/program";
import { describeTxError } from "@/lib/tx-error";

const MAX_SKU_CODE_LEN = 32;
const MAX_NAME_LEN = 64;

export async function registerProduct(
  wallet: SigningWallet,
  skuCode: string,
  name: string,
): Promise<{ error: string | null }> {
  const trimmedCode = skuCode.trim();
  const trimmedName = name.trim();
  if (!trimmedCode || trimmedCode.length > MAX_SKU_CODE_LEN) {
    return { error: `SKU code is required and must be ${MAX_SKU_CODE_LEN} characters or fewer.` };
  }
  if (!trimmedName || trimmedName.length > MAX_NAME_LEN) {
    return { error: `Name is required and must be ${MAX_NAME_LEN} characters or fewer.` };
  }

  const program = getProgramForWallet(wallet);
  try {
    // `roleAssignment` and `product` (seeds derived from `sku_code` below)
    // and `systemProgram` are all auto-resolved by the client.
    await program.methods
      .registerProduct(trimmedCode, trimmedName)
      .accounts({ registrant: wallet.publicKey })
      .rpc();
  } catch (error) {
    return { error: describeTxError(error, "Failed to register product.") };
  }
  return { error: null };
}
```

- [ ] **Step 2: Write `RegisterProductForm.tsx`**

Create `app/src/app/products/RegisterProductForm.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { registerProduct } from "./actions";

export function RegisterProductForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = useWalletGatedAction<FormData>(async (wallet, formData) => {
    setPending(true);
    setError(null);
    const skuCode = String(formData.get("skuCode") ?? "");
    const name = String(formData.get("name") ?? "");
    const result = await registerProduct(wallet, skuCode, name);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  });

  return (
    <form action={handleSubmit}>
      <div className="field">
        <label htmlFor="skuCode">SKU code</label>
        <input
          id="skuCode"
          name="skuCode"
          className="mono"
          type="text"
          maxLength={32}
          placeholder="e.g. TOMATO-ROMA-1KG"
          required
        />
      </div>
      <div className="field">
        <label htmlFor="name">Name</label>
        <input id="name" name="name" type="text" maxLength={64} placeholder="e.g. Roma Tomatoes 1kg" required />
      </div>
      {error ? <div className="field-error">{error}</div> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={pending}>
        {pending ? "Registering…" : "Register product"}
      </button>
    </form>
  );
}
```

- [ ] **Step 3: Write `page.tsx`**

Create `app/src/app/products/page.tsx`:

```tsx
import { fetchAllProducts } from "@/lib/accounts";
import { requireSession } from "@/lib/guard";
import { NavBar } from "@/components/NavBar";

import { RegisterProductForm } from "./RegisterProductForm";

export default async function ProductsPage() {
  const session = await requireSession();
  const products = await fetchAllProducts();

  return (
    <div>
      <NavBar roles={session.roles} activeRole={session.roles[0]} wallet={session.wallet} />
      <div className="page layout-split">
        <div className="panel-narrow card">
          <div className="section-title">Register product</div>
          <div className="section-sub">register_product(sku_code, name)</div>
          <RegisterProductForm />
        </div>
        <div className="panel-wide card">
          <div className="section-title">Product catalog</div>
          <div className="section-sub">Shared across every account — pick any of these when building a batch</div>
          {products.length === 0 ? (
            <div className="empty-state">No products registered yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>SKU code</th>
                  <th>Name</th>
                </tr>
              </thead>
              <tbody>
                {products.map(({ publicKey, account }) => (
                  <tr key={publicKey.toBase58()}>
                    <td className="mono">{account.skuCode}</td>
                    <td>{account.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add a "Products" link to `NavBar`**

In `app/src/components/NavBar.tsx`, add a plain link alongside the role badges — every `NavBar` caller already has `roles.length >= 1` (an unauthenticated or role-less session never reaches a page that renders `NavBar`), so this needs no extra role gate:

```tsx
      <div className="right">
        {roles.map((role) => (
          <Link key={role} href={roleHomePath(role)}>
            <RoleBadge role={role} active={role === activeRole} />
          </Link>
        ))}
        <Link href="/products" style={{ color: "var(--muted)", fontSize: 13 }}>
          Products
        </Link>
        <span className="wallet">{shortWallet(wallet)}</span>
```

- [ ] **Step 5: Verify**

Run: `cd app && npm run build && npm run lint && npm run test`
Expected: clean build (confirms `products.skuCode`/`products.name` match the regenerated IDL's camelCase field names), clean lint, existing tests unaffected.

- [ ] **Step 6: Commit**

```bash
git add app/src/app/products app/src/components/NavBar.tsx
git commit -m "feat: add shared product catalog page"
```

---

### Task 5: `RegisterBatchForm` — multiple product rows, one combined transaction

**Files:**
- Modify: `app/src/app/source/actions.ts`
- Modify: `app/src/app/source/RegisterBatchForm.tsx`
- Create: `app/src/app/source/build-register-batch-instructions.ts`
- Create: `app/src/app/source/build-register-batch-instructions.test.ts`

**Interfaces:**
- Consumes: `fetchAllProducts` (Task 3), `batch-id.ts`'s `newBatchId` (existing), `format.ts`'s `sourceTypeFormArg` (existing).
- Produces: `registerBatch(wallet, sourceType, rows, existingSkuCodes)` in `source/actions.ts` — the new signature Task 6 does not depend on (Task 6 only reads batches/line-items, never writes them).

**Why a dedicated pure function:** deciding which rows need a `register_product` call (new SKU typed inline) versus which reference an already-catalogued one, and de-duplicating repeated new codes within one submission, is exactly the kind of logic worth testing directly rather than only through a live transaction.

- [ ] **Step 1: Write the failing test for the instruction-planning logic**

Create `app/src/app/source/build-register-batch-instructions.test.ts`:

```ts
import { describe, expect, it } from "vitest";

import { planLineItems, type ProductRow } from "./build-register-batch-instructions";

describe("planLineItems", () => {
  const existing = new Set(["EXISTING-SKU"]);

  it("marks a row referencing an already-catalogued SKU as not-new", () => {
    const rows: ProductRow[] = [{ skuCode: "EXISTING-SKU", name: "", quantity: "10" }];
    const plan = planLineItems(rows, existing);
    expect(plan.items).toEqual([{ index: 0, skuCode: "EXISTING-SKU", quantity: "10" }]);
    expect(plan.newProducts).toEqual([]);
  });

  it("marks a row referencing an unknown SKU as new, carrying its name", () => {
    const rows: ProductRow[] = [{ skuCode: "BRAND-NEW", name: "Brand New Thing", quantity: "5" }];
    const plan = planLineItems(rows, existing);
    expect(plan.items).toEqual([{ index: 0, skuCode: "BRAND-NEW", quantity: "5" }]);
    expect(plan.newProducts).toEqual([{ skuCode: "BRAND-NEW", name: "Brand New Thing" }]);
  });

  it("de-duplicates the same new SKU appearing in two rows of one submission", () => {
    const rows: ProductRow[] = [
      { skuCode: "DUPLICATE-NEW", name: "First Lot", quantity: "1" },
      { skuCode: "DUPLICATE-NEW", name: "Second Lot Same Sku", quantity: "2" },
    ];
    const plan = planLineItems(rows, existing);
    expect(plan.items).toHaveLength(2);
    expect(plan.newProducts).toEqual([{ skuCode: "DUPLICATE-NEW", name: "First Lot" }]);
  });

  it("rejects an empty row list", () => {
    expect(() => planLineItems([], existing)).toThrow(/at least one/i);
  });

  it("rejects a row with a blank sku code", () => {
    const rows: ProductRow[] = [{ skuCode: "  ", name: "x", quantity: "1" }];
    expect(() => planLineItems(rows, existing)).toThrow(/sku code/i);
  });

  it("rejects a row with a non-numeric quantity", () => {
    const rows: ProductRow[] = [{ skuCode: "SKU", name: "x", quantity: "abc" }];
    expect(() => planLineItems(rows, existing)).toThrow(/quantity/i);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd app && npm run test -- build-register-batch-instructions` — expect failure (module doesn't exist).

- [ ] **Step 3: Implement `planLineItems`**

Create `app/src/app/source/build-register-batch-instructions.ts`:

```ts
export type ProductRow = { skuCode: string; name: string; quantity: string };

export type LineItemPlanEntry = { index: number; skuCode: string; quantity: string };
export type NewProduct = { skuCode: string; name: string };
export type LineItemPlan = { items: LineItemPlanEntry[]; newProducts: NewProduct[] };

// Decides which rows reference a SKU that doesn't exist in the catalog
// fetched at submission time (and so need their own register_product call
// bundled into the same transaction), de-duplicating repeated new codes
// within one submission -- pure so it's cheap to test directly, separate
// from actually building/sending the transaction.
export function planLineItems(rows: ProductRow[], existingSkuCodes: Set<string>): LineItemPlan {
  if (rows.length === 0) {
    throw new Error("A batch needs at least one product.");
  }

  const items: LineItemPlanEntry[] = [];
  const newProducts: NewProduct[] = [];
  const seenNewCodes = new Set<string>();

  rows.forEach((row, index) => {
    const skuCode = row.skuCode.trim();
    if (!skuCode) {
      throw new Error(`Row ${index + 1}: SKU code is required.`);
    }
    if (!/^\d+$/.test(row.quantity.trim())) {
      throw new Error(`Row ${index + 1}: quantity must be a whole number.`);
    }
    items.push({ index, skuCode, quantity: row.quantity.trim() });

    if (!existingSkuCodes.has(skuCode) && !seenNewCodes.has(skuCode)) {
      seenNewCodes.add(skuCode);
      newProducts.push({ skuCode, name: row.name.trim() });
    }
  });

  return { items, newProducts };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd app && npm run test -- build-register-batch-instructions` — expect all 6 cases pass.

- [ ] **Step 5: Rework `source/actions.ts`'s `registerBatch` to build and send the combined transaction**

Replace the entire contents of `app/src/app/source/actions.ts`:

```ts
"use client";

import BN from "bn.js";
import { Transaction } from "@solana/web3.js";

import { fetchAllProducts } from "@/lib/accounts";
import { newBatchId } from "@/lib/batch-id";
import { sourceTypeFormArg } from "@/lib/format";
import { getProgramForWallet, type SigningWallet } from "@/lib/program";
import { describeTxError } from "@/lib/tx-error";

import { planLineItems, type ProductRow } from "./build-register-batch-instructions";

const SOURCE_TYPES = ["Farmer", "Factory", "TraditionalMarket", "Supermarket"] as const;

export async function registerBatch(
  wallet: SigningWallet,
  sourceType: (typeof SOURCE_TYPES)[number],
  rows: ProductRow[],
): Promise<{ error: string | null }> {
  if (!SOURCE_TYPES.includes(sourceType)) {
    return { error: "Choose a source type." };
  }

  let plan;
  try {
    const existing = await fetchAllProducts();
    const existingSkuCodes = new Set(existing.map((entry) => entry.account.skuCode));
    plan = planLineItems(rows, existingSkuCodes);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Invalid product rows." };
  }

  const program = getProgramForWallet(wallet);
  const batchIdBytes = newBatchId();

  try {
    // `roleAssignment` (seeds derived from `source`/`registrant` below),
    // `batch`/`product`/`lineItem` (seeds derived from the args below) and
    // `systemProgram` are all auto-resolved by the client for every
    // instruction composed into this one transaction.
    const registerBatchIx = await program.methods
      .registerBatch(
        Array.from(batchIdBytes),
        sourceTypeFormArg(sourceType) as never,
        plan.items.length,
      )
      .accounts({ source: wallet.publicKey })
      .instruction();

    const registerProductIxs = await Promise.all(
      plan.newProducts.map((product) =>
        program.methods
          .registerProduct(product.skuCode, product.name)
          .accounts({ registrant: wallet.publicKey })
          .instruction(),
      ),
    );

    const addLineItemIxs = await Promise.all(
      plan.items.map((item) =>
        program.methods
          .addLineItem(item.index, item.skuCode, new BN(item.quantity))
          .accounts({ source: wallet.publicKey })
          .instruction(),
      ),
    );

    const tx = new Transaction().add(registerBatchIx, ...registerProductIxs, ...addLineItemIxs);
    await program.provider.sendAndConfirm?.(tx);
  } catch (error) {
    return { error: describeTxError(error, "Failed to register batch.") };
  }
  return { error: null };
}
```

- [ ] **Step 6: Rework `RegisterBatchForm.tsx`**

Replace the entire contents of `app/src/app/source/RegisterBatchForm.tsx`:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { useWalletGatedAction } from "@/lib/use-wallet-gated-action";

import { registerBatch } from "./actions";
import type { ProductRow } from "./build-register-batch-instructions";

const EMPTY_ROW: ProductRow = { skuCode: "", name: "", quantity: "" };

export function RegisterBatchForm() {
  const router = useRouter();
  const [rows, setRows] = useState<ProductRow[]>([{ ...EMPTY_ROW }]);
  const [sourceType, setSourceType] = useState<
    "Farmer" | "Factory" | "TraditionalMarket" | "Supermarket"
  >("Farmer");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const updateRow = (index: number, patch: Partial<ProductRow>) => {
    setRows((current) => current.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const submit = useWalletGatedAction<void>(async (wallet) => {
    setPending(true);
    setError(null);
    const result = await registerBatch(wallet, sourceType, rows);
    setPending(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setRows([{ ...EMPTY_ROW }]);
    router.refresh();
  });

  return (
    <div>
      <div className="field">
        <label htmlFor="sourceType">Source type</label>
        <select
          id="sourceType"
          value={sourceType}
          onChange={(e) => setSourceType(e.target.value as typeof sourceType)}
        >
          <option value="Farmer">Farmer</option>
          <option value="Factory">Factory</option>
          <option value="TraditionalMarket">Traditional market</option>
          <option value="Supermarket">Supermarket</option>
        </select>
      </div>

      {rows.map((row, index) => (
        <div key={index} className="field-grid" style={{ marginBottom: 12 }}>
          <div className="field">
            <label htmlFor={`skuCode-${index}`}>SKU code</label>
            <input
              id={`skuCode-${index}`}
              className="mono"
              type="text"
              maxLength={32}
              placeholder="existing or brand-new code"
              value={row.skuCode}
              onChange={(e) => updateRow(index, { skuCode: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor={`name-${index}`}>Name (only needed for a brand-new SKU)</label>
            <input
              id={`name-${index}`}
              type="text"
              maxLength={64}
              placeholder="e.g. Roma Tomatoes 1kg"
              value={row.name}
              onChange={(e) => updateRow(index, { name: e.target.value })}
            />
          </div>
          <div className="field">
            <label htmlFor={`quantity-${index}`}>Quantity</label>
            <input
              id={`quantity-${index}`}
              type="number"
              min={0}
              step={1}
              value={row.quantity}
              onChange={(e) => updateRow(index, { quantity: e.target.value })}
              required
            />
          </div>
          {rows.length > 1 ? (
            <button
              type="button"
              className="link-button"
              onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          ) : null}
        </div>
      ))}

      <button
        type="button"
        className="btn btn-outline"
        onClick={() => setRows((current) => [...current, { ...EMPTY_ROW }])}
        style={{ marginBottom: 12 }}
      >
        + Add another product
      </button>

      {error ? <div className="field-error">{error}</div> : null}
      <button
        type="button"
        className="btn btn-primary btn-block"
        disabled={pending}
        onClick={() => submit()}
      >
        {pending ? "Registering…" : "Register batch"}
      </button>
    </div>
  );
}
```

- [ ] **Step 7: Verify**

Run: `cd app && npm run build && npm run lint && npm run test`
Expected: clean build, clean lint, all tests pass including the 6 new `planLineItems` cases.

- [ ] **Step 8: Commit**

```bash
git add app/src/app/source/actions.ts app/src/app/source/RegisterBatchForm.tsx app/src/app/source/build-register-batch-instructions.ts app/src/app/source/build-register-batch-instructions.test.ts
git commit -m "feat: RegisterBatchForm supports multiple products in one combined transaction"
```

---

### Task 6: Batch detail page and `BatchTable` show line items instead of a single ingredient

**Files:**
- Modify: `app/src/components/BatchTable.tsx`
- Modify: `app/src/app/batch/[id]/page.tsx`

**Interfaces:**
- Consumes: `fetchLineItemsForBatch`, `fetchProduct` (Task 3). `Batch.lineItemCount` (Task 2, surfaced via the Task 3 IDL regen as `lineItemCount` on the decoded account).
- Produces: nothing new consumed elsewhere — this is the last piece reading the new shape.

- [ ] **Step 1: Update `BatchTable.tsx`**

Replace the `Ingredient`/`Qty` columns with an item count. Full replacement of `app/src/components/BatchTable.tsx`:

```tsx
import Link from "next/link";

import type { BatchEntry } from "@/lib/accounts";
import { batchIdToHex, shortBatchId } from "@/lib/batch-id";
import { sourceTypeLabel } from "@/lib/format";

import { StatusBadge } from "./StatusBadge";

export function BatchTable({
  batches,
  showSource,
}: {
  batches: BatchEntry[];
  showSource: boolean;
}) {
  if (batches.length === 0) {
    return <div className="empty-state">No batches yet.</div>;
  }

  return (
    <table>
      <thead>
        <tr>
          <th>Batch ID</th>
          <th>Items</th>
          <th>Source type</th>
          {showSource ? <th>Registered by</th> : null}
          <th>Status</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {batches.map(({ publicKey, account }) => {
          const hexId = batchIdToHex(Uint8Array.from(account.batchId));
          return (
            <tr key={publicKey.toBase58()}>
              <td className="mono">{shortBatchId(hexId)}</td>
              <td>{account.lineItemCount} product{account.lineItemCount === 1 ? "" : "s"}</td>
              <td>{sourceTypeLabel(account.sourceType)}</td>
              {showSource ? (
                <td className="mono">
                  {account.source.toBase58().slice(0, 4)}…{account.source.toBase58().slice(-4)}
                </td>
              ) : null}
              <td>
                <StatusBadge status={account.status} />
              </td>
              <td>
                <Link href={`/batch/${hexId}`}>View →</Link>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Update the batch detail page**

In `app/src/app/batch/[id]/page.tsx`:

1. Update the imports:

```tsx
import { fetchBatch, fetchLineItemsForBatch, fetchMovementsForBatch } from "@/lib/accounts";
import { batchPda, getReadProgram } from "@/lib/program";
```

(`getReadProgram` replaces the standalone `batchPda`-only import line — a `LineItem.product` is a `Pubkey`, not a SKU code, so resolving it is a direct account fetch by address via `getReadProgram().account.product.fetchNullable(...)`, not `fetchProduct(skuCode)`, which takes a code and derives the PDA from it — the wrong tool for this lookup.)

2. After the existing `const movements = await fetchMovementsForBatch(batchAddress);` line, add:

```tsx
  const lineItems = await fetchLineItemsForBatch(batchAddress);
  const products = await Promise.all(
    lineItems.map((item) => getReadProgram().account.product.fetchNullable(item.product)),
  );
```

3. Replace the single-ingredient header block:

```tsx
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 10 }}>
              {batch.ingredientName}
            </div>
```
with:
```tsx
            <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 10 }}>
              {batch.lineItemCount} product{batch.lineItemCount === 1 ? "" : "s"}
            </div>
```

4. Remove the now-nonexistent "Quantity" field block (`batch.quantity` no longer exists):

```tsx
              <div>
                <div className="section-sub" style={{ marginBottom: 4 }}>
                  Quantity
                </div>
                <div style={{ fontWeight: 600 }}>{batch.quantity.toString()}</div>
              </div>
```
Delete that whole `<div>...</div>` block entirely (keep the "Source type" block right after it).

5. Add a new card listing the line items, right after the existing "Batch fields" card's closing `</div>` and before the `<div className="panel-wide card">` movement-timeline block:

```tsx
          <div className="card">
            <div className="section-title" style={{ marginBottom: 16 }}>
              Products in this batch
            </div>
            <table>
              <thead>
                <tr>
                  <th>SKU code</th>
                  <th>Name</th>
                  <th>Quantity</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={item.index}>
                    <td className="mono">{products[i]?.skuCode ?? "—"}</td>
                    <td>{products[i]?.name ?? "—"}</td>
                    <td>{item.quantity.toString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
```

- [ ] **Step 3: Verify**

Run: `cd app && npm run build && npm run lint && npm run test`
Expected: clean build (confirms `account.lineItemCount`/`item.product`/`item.quantity`/`item.index` all match the regenerated IDL's camelCase fields), clean lint, existing tests unaffected.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/BatchTable.tsx "app/src/app/batch/[id]/page.tsx"
git commit -m "feat: batch detail page and batch lists show line items, not a single ingredient"
```

---

### Task 7: Full end-to-end manual verification

**Files:** none (verification only).

**Interfaces:** none produced — this is the plan's acceptance test.

- [ ] **Step 1: Run the full automated suite one more time**

Run: `cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2 && cd .. && cargo test && cargo clippy --all-targets -- -D warnings`
Run: `cd app && npm run build && npm run lint && npm run test`
Expected: everything clean — this is a breaking on-chain layout change, so a fresh `--reset` is required next regardless.

- [ ] **Step 2: Fresh validator, redeploy, re-provision**

```bash
# kill any existing validator, then from the repo root:
solana-test-validator --reset
# in another terminal, from the repo root:
(cd programs/supply-chain-web3 && cargo build-sbf --tools-version v2.3.2)
anchor deploy
cd app && npm run provision
```

- [ ] **Step 3: Manual verification via the running app**

Run `make web` (or `npm run dev` inside `app/`). Using a demo-login button or a real connected wallet holding `Source`:

1. Go to `/products`. Register a new SKU (e.g. `CHICKEN-BREAST-1KG` / "Chicken Breast 1kg"). Confirm it appears in the catalog table without a page reload issue (after `router.refresh()`).
2. Go to `/source`. Add two rows to "Register batch": row 1 referencing the SKU just registered (existing), row 2 with a brand-new SKU code + name typed inline (not yet in the catalog). Submit. Confirm it succeeds in **one** wallet signature (open your wallet extension's activity/logs if available, or just confirm only one approval prompt appears) — proving the combined transaction is genuinely one transaction, not a sequence of separate approvals.
3. Go to `/products` again. Confirm the brand-new SKU from step 2 now appears in the catalog (proving the bundled `register_product` call landed).
4. From `/source`'s batch list, click into the new batch's detail page. Confirm both products show with their correct SKU code, name, and quantity, and the header reads "2 products".
5. As Carrier, log a movement against this batch; as Restaurant, receive it. Confirm both succeed exactly as before (proving `log_movement`/`receive_at_restaurant` genuinely needed zero changes) and the batch detail page still shows both line items correctly after status changes to Delivered.
6. Back on `/source`'s or `/admin`'s batch list, confirm the row now shows "2 products" instead of an ingredient name, and clicking "View" still reaches the same detail page.

- [ ] **Step 4: Report**

No code change for this task — if every check above passes, the plan is complete. If any step fails, fix the specific issue found (not a speculative rewrite) and re-run this task's checklist from Step 3.
