# Restaurant Ingredient Supply Chain — v5 Multi-Product Batches

## Context

Through v1–v4 ([prd/v1_basic_functionality.md](v1_basic_functionality.md),
[prd/v2_frontend.md](v2_frontend.md), [prd/v3_wallet_auth.md](v3_wallet_auth.md),
[prd/v4_multi_role.md](v4_multi_role.md)) a `Batch` carried exactly one
product: `ingredient_name` + `quantity` + `source_type` lived directly on
the `Batch` account, one ingredient per registration.

v5 reworks this: a batch is a shipment that can carry one or more
products, each referencing a shared, reusable SKU catalog rather than a
free-text name typed fresh every time. Status/movement/delivery tracking
stays at the whole-shipment level, unchanged — a batch moves and arrives
as one unit regardless of how many products it carries.

This is a breaking change to `Batch`'s on-chain layout, plus two new
account types. There is no migration path — a fresh `--reset` + redeploy
+ re-provision is required, same as every prior schema change in this
project's history.

## On-chain data model

### `Product` — the shared SKU catalog

A new account, one per product code, created once and reused by every
batch from every wallet:

```rust
pub const PRODUCT_SEED: &[u8] = b"product";
pub const MAX_SKU_CODE_LEN: usize = 32;

#[account]
#[derive(InitSpace)]
pub struct Product {
    #[max_len(MAX_SKU_CODE_LEN)]
    pub sku_code: String,
    #[max_len(MAX_INGREDIENT_NAME_LEN)]
    pub name: String,
}
```

PDA: `seeds = [PRODUCT_SEED, sku_code.as_bytes()]`. The code is the
account's identity — two different products can never collide on the
same code, and the same code always resolves to the same account for
every caller.

### `Batch` — drops its single product, gains a declared item count

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

`ingredient_name` and `quantity` are gone from `Batch` — they move onto
`LineItem` (quantity) and `Product` (name), respectively. `source_type`
stays here: it describes the shipment as a whole (this project's existing
decision, unchanged by v5), not any one product in it.

### `LineItem` — one product's place in one batch

```rust
pub const LINE_ITEM_SEED: &[u8] = b"line_item";

#[account]
#[derive(InitSpace)]
pub struct LineItem {
    pub batch: Pubkey,
    pub index: u16,
    pub product: Pubkey,
    pub quantity: u64,
}
```

PDA: `seeds = [LINE_ITEM_SEED, batch.key().as_ref(), index.to_le_bytes().as_ref()]`.
Nothing stops the same `product` appearing at two different indices in
one batch (e.g. two separate lots of the same SKU) — left unrestricted,
since that's a realistic shipment, not a bug.

## `register_product` — idempotent SKU registration

Any wallet holding **at least one** of the four roles (not a role-less
wallet) can register a SKU. Gated by `init_if_needed`, not `init`: a
transaction that blindly "ensures this SKU exists" before referencing it
must succeed whether the code is brand new or already registered by
someone else entirely — rejecting an already-existing code would make
every batch submission that reuses a known SKU fail for no reason.

```rust
#[derive(Accounts)]
#[instruction(sku_code: String, name: String)]
pub struct RegisterProduct<'info> {
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

pub fn handle_register_product(ctx: Context<RegisterProduct>, sku_code: String, name: String) -> Result<()> {
    let r = &ctx.accounts.role_assignment;
    require!(r.is_admin || r.is_source || r.is_carrier || r.is_restaurant, ErrorCode::Unauthorized);

    // init_if_needed re-runs this handler even when the account already
    // existed — only write fields on genuine first creation (detected via
    // the zero-initialized default), so a later caller passing a different
    // name for the same code can't silently rename an existing SKU.
    let product = &mut ctx.accounts.product;
    if product.sku_code.is_empty() {
        product.sku_code = sku_code;
        product.name = name;
    }
    Ok(())
}
```

First registration of a code wins and sticks; every later call for that
same code — matching name or not — succeeds as a no-op. The role check
itself is unconditional: idempotency governs account creation, not
authorization.

## `register_batch` — drops the product fields, declares the item count

```rust
pub fn handle_register_batch(ctx: Context<RegisterBatch>, batch_id: [u8; 16], source_type: SourceType, line_item_count: u16) -> Result<()>
```

Otherwise unchanged from v4: still requires `role_assignment.is_source`,
still creates the `Batch` PDA from `batch_id`. `ingredient_name`/
`quantity` are gone from its args — they're supplied per-product via
`add_line_item`, below.

## `add_line_item` — one call per product, same auto-resolution pattern as the rest of the program

```rust
#[derive(Accounts)]
#[instruction(index: u16, sku_code: String, quantity: u64)]
pub struct AddLineItem<'info> {
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

pub fn handle_add_line_item(ctx: Context<AddLineItem>, index: u16, sku_code: String, quantity: u64) -> Result<()> {
    require!(ctx.accounts.role_assignment.is_source, ErrorCode::Unauthorized);
    require!(index < ctx.accounts.batch.line_item_count, ErrorCode::LineItemIndexOutOfRange);

    let line_item = &mut ctx.accounts.line_item;
    line_item.batch = ctx.accounts.batch.key();
    line_item.index = index;
    line_item.product = ctx.accounts.product.key();
    line_item.quantity = quantity;
    Ok(())
}
```

`sku_code`, not a raw `Pubkey`, is the argument — `product`'s PDA
auto-resolves from it exactly the way `register_product`'s does (and the
way `target_role_assignment`/`admin_role_assignment` already auto-resolve
elsewhere in this program), so no caller ever derives a PDA by hand.
`has_one = source` on `batch` enforces that only the wallet that
registered this batch can add line items to it — holding `is_source`
generally isn't enough on its own.

`index` must be strictly less than the batch's declared
`line_item_count`; `LineItem`'s own PDA (seeded by `batch` + `index`)
makes re-adding the same index a hard failure via `init`'s own
already-exists check — no separate duplicate guard needed.

## Atomicity: one transaction, not a multi-step flow

A client registers a multi-product batch by composing one transaction:
`register_batch` + `register_product` for any SKU that might not exist
yet + `add_line_item` once per product, all signed and sent together.
Solana's own transaction atomicity means either the whole batch — the
container and every one of its line items — lands, or none of it does.
There is no "batch exists but is missing some of its line items" state to
defend against anywhere else in the program: by the time any other
instruction (`log_movement`, `receive_at_restaurant`) can see a `Batch`
at all, it is already complete. Neither of those two instructions
changes in any way for v5.

## Frontend

- **Product catalog**: a new page/section where any role-holding wallet
  can register a SKU (`sku_code` + `name`) and browse/search existing
  ones.
- **`RegisterBatchForm`**: becomes a repeatable row of
  product-picker + quantity, add/remove rows freely — one row is exactly
  today's single-product case, nothing distinguishes it from any other
  count. Submitting builds the one combined transaction described above.
- **Batch detail page**: fetches every `LineItem` for a batch (via
  `getProgramAccounts` memcmp-filtered on the `batch` field) and resolves
  each one's `product` to display its name.
- **Batch list views** (source's own list, admin's "all batches"): show
  an item count instead of a single ingredient/quantity column, linking
  to the detail page for the full breakdown.
- **Visibility, unchanged from every prior version**: nothing here is
  private. `Product`, `Batch`, and `LineItem` are all ordinary public
  Solana accounts; a dashboard scoping a list to "your own batches" (as
  `/source` already does) is a UI convenience filter, not an access
  boundary — anyone can read any of this data directly.

## Out of scope for v5

- Editing or retiring a `Product` once registered — first registration
  of a code is permanent; no update instruction.
- Preventing the same `product` from appearing twice in one batch at
  different indices — a legitimate shipment (two separate lots of the
  same SKU), not a defect to guard against.
- Per-line-item status/movement tracking — status stays exclusively at
  the `Batch` level, per this spec's own design decision above.
- Any migration of existing on-chain `Batch` data — this is a breaking
  layout change, not a migration; a fresh `--reset` is required.
