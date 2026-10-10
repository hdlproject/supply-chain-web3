use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Batch, BatchStatus, RoleAssignment, SourceType},
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
        ctx.accounts.role_assignment.is_source,
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
