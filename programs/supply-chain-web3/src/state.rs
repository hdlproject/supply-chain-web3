use anchor_lang::prelude::*;

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
