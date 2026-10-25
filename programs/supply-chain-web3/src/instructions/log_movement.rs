use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Batch, BatchStatus, Movement, RoleAssignment},
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
    vehicle_id: Option<String>,
    from_location: String,
    to_location: String,
) -> Result<()> {
    require!(
        ctx.accounts.role_assignment.is_carrier,
        ErrorCode::Unauthorized,
    );
    require!(
        ctx.accounts.batch.status != BatchStatus::Delivered,
        ErrorCode::InvalidStatusTransition,
    );
    require!(
        from_location.len() <= MAX_LOCATION_LEN && to_location.len() <= MAX_LOCATION_LEN,
        ErrorCode::StringTooLong,
    );
    if let Some(ref id) = vehicle_id {
        require!(id.len() <= MAX_ID_LEN, ErrorCode::StringTooLong);
    }

    let movement = &mut ctx.accounts.movement;
    movement.batch = ctx.accounts.batch.key();
    movement.carrier = ctx.accounts.carrier.key();
    movement.vehicle_id = vehicle_id;
    movement.from_location = from_location;
    movement.to_location = to_location;
    movement.timestamp = Clock::get()?.unix_timestamp;

    ctx.accounts.batch.movement_count += 1;
    ctx.accounts.batch.status = BatchStatus::InTransit;
    Ok(())
}
