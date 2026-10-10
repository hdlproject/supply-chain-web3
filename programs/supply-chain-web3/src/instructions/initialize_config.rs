use anchor_lang::prelude::*;

use crate::{
    constants::*,
    state::{Config, RoleAssignment},
};

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,
    #[account(
        init,
        payer = admin,
        space = 8 + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = admin,
        space = 8 + RoleAssignment::INIT_SPACE,
        seeds = [ROLE_SEED, admin.key().as_ref()],
        bump
    )]
    pub role_assignment: Account<'info, RoleAssignment>,
    pub system_program: Program<'info, System>,
}

pub fn handle_initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
    ctx.accounts.config.bootstrap_authority = ctx.accounts.admin.key();

    let role_assignment = &mut ctx.accounts.role_assignment;
    role_assignment.wallet = ctx.accounts.admin.key();
    role_assignment.is_admin = true;
    role_assignment.is_source = true;
    role_assignment.is_carrier = true;
    role_assignment.is_restaurant = true;
    Ok(())
}
