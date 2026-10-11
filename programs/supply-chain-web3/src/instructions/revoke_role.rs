use anchor_lang::prelude::*;

use crate::{
    constants::*,
    error::ErrorCode,
    state::{Role, RoleAssignment},
};

#[derive(Accounts)]
#[instruction(wallet: Pubkey, role: Role)]
pub struct RevokeRole<'info> {
    pub admin: Signer<'info>,
    #[account(seeds = [ROLE_SEED, admin.key().as_ref()], bump)]
    pub admin_role_assignment: Account<'info, RoleAssignment>,
    #[account(mut, seeds = [ROLE_SEED, wallet.as_ref()], bump)]
    pub target_role_assignment: Account<'info, RoleAssignment>,
}

pub fn handle_revoke_role(ctx: Context<RevokeRole>, _wallet: Pubkey, role: Role) -> Result<()> {
    require!(
        ctx.accounts.admin_role_assignment.is_admin,
        ErrorCode::Unauthorized,
    );

    let target = &mut ctx.accounts.target_role_assignment;
    let currently_held = match role {
        Role::Admin => target.is_admin,
        Role::Source => target.is_source,
        Role::Carrier => target.is_carrier,
        Role::Restaurant => target.is_restaurant,
    };
    require!(currently_held, ErrorCode::RoleNotHeld);

    match role {
        Role::Admin => target.is_admin = false,
        Role::Source => target.is_source = false,
        Role::Carrier => target.is_carrier = false,
        Role::Restaurant => target.is_restaurant = false,
    }
    Ok(())
}
