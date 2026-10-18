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
        require!(!sku_code.is_empty(), ErrorCode::StringTooLong);
        require!(name.len() <= MAX_INGREDIENT_NAME_LEN, ErrorCode::StringTooLong);
        product.sku_code = sku_code;
        product.name = name;
    }
    Ok(())
}
