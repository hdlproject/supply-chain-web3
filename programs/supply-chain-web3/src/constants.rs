use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";

#[constant]
pub const ROLE_SEED: &[u8] = b"role";

#[constant]
pub const BATCH_SEED: &[u8] = b"batch";

// Not `#[constant]`: `usize` has no `IdlBuild` impl (its width isn't
// portable), so tagging it breaks `anchor idl build`. These are internal
// space/validation limits, not part of the public interface.
pub const MAX_INGREDIENT_NAME_LEN: usize = 64;

#[constant]
pub const MOVEMENT_SEED: &[u8] = b"movement";

pub const MAX_LOCATION_LEN: usize = 64;

pub const MAX_ID_LEN: usize = 32;

#[constant]
pub const PRODUCT_SEED: &[u8] = b"product";

pub const MAX_SKU_CODE_LEN: usize = 32;

#[constant]
pub const LINE_ITEM_SEED: &[u8] = b"line_item";
