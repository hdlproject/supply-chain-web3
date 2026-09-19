pub mod constants;
pub mod error;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("5k3AeBoUR2LsjXT8XtddP9VfcnztLQyiK5YgYscPtReX");

#[program]
pub mod supply_chain_web3 {
    use super::*;

    pub fn initialize_config(ctx: Context<InitializeConfig>) -> Result<()> {
        crate::instructions::initialize_config::handle_initialize_config(ctx)
    }

    pub fn assign_role(ctx: Context<AssignRole>, wallet: Pubkey, role: Role) -> Result<()> {
        crate::instructions::assign_role::handle_assign_role(ctx, wallet, role)
    }
}
