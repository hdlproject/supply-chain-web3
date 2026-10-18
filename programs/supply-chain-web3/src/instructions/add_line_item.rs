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
