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
