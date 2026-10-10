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

    pub fn grant_role(ctx: Context<GrantRole>, wallet: Pubkey, role: Role) -> Result<()> {
        crate::instructions::grant_role::handle_grant_role(ctx, wallet, role)
    }

    pub fn revoke_role(ctx: Context<RevokeRole>, wallet: Pubkey, role: Role) -> Result<()> {
        crate::instructions::revoke_role::handle_revoke_role(ctx, wallet, role)
    }

    pub fn register_batch(
        ctx: Context<RegisterBatch>,
        batch_id: [u8; 16],
        ingredient_name: String,
        quantity: u64,
        source_type: SourceType,
    ) -> Result<()> {
        crate::instructions::register_batch::handle_register_batch(
            ctx,
            batch_id,
            ingredient_name,
            quantity,
            source_type,
        )
    }

    pub fn log_movement(
        ctx: Context<LogMovement>,
        courier_id: Option<String>,
        vehicle_id: Option<String>,
        from_location: String,
        to_location: String,
    ) -> Result<()> {
        crate::instructions::log_movement::handle_log_movement(
            ctx,
            courier_id,
            vehicle_id,
            from_location,
            to_location,
        )
    }

    pub fn receive_at_restaurant(ctx: Context<ReceiveAtRestaurant>) -> Result<()> {
        crate::instructions::receive_at_restaurant::handle_receive_at_restaurant(ctx)
    }
}
