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
