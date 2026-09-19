use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const ROLE_SEED: &[u8] = b"role";

#[constant]
pub const BATCH_SEED: &[u8] = b"batch";

#[constant]
pub const MAX_INGREDIENT_NAME_LEN: usize = 64;
