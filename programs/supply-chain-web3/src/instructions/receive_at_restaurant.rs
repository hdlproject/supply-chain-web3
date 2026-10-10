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
        ctx.accounts.role_assignment.is_restaurant,
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
