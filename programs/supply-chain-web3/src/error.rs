use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer is not authorized to perform this action")]
    Unauthorized,

    #[msg("Provided string exceeds maximum allowed length")]
    StringTooLong,

    #[msg("Batch has already been delivered")]
    InvalidStatusTransition,
    #[msg("Wallet does not hold the role being revoked")]
    RoleNotHeld,
    #[msg("Line item index is not less than the batch's declared line_item_count")]
    LineItemIndexOutOfRange,
}
