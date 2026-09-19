use anchor_lang::prelude::*;

use crate::constants::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Role {
    Source,
    Carrier,
    Restaurant,
}

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub admin: Pubkey,
}

#[account]
#[derive(InitSpace)]
pub struct RoleAssignment {
    pub wallet: Pubkey,
    pub role: Role,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum SourceType {
    Farmer,
    Factory,
    TraditionalMarket,
    Supermarket,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum BatchStatus {
    Registered,
    InTransit,
    Delivered,
}

#[account]
#[derive(InitSpace)]
pub struct Batch {
    pub batch_id: [u8; 16],
    #[max_len(MAX_INGREDIENT_NAME_LEN)]
    pub ingredient_name: String,
    pub quantity: u64,
    pub source_type: SourceType,
    pub source: Pubkey,
    pub status: BatchStatus,
    pub movement_count: u32,
    pub received_by: Pubkey,
    pub created_at: i64,
    pub delivered_at: i64,
}
