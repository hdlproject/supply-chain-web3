use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer is not authorized to perform this action")]
    Unauthorized,

    #[msg("Provided string exceeds maximum allowed length")]
    StringTooLong,

    #[msg("Batch has already been delivered")]
    InvalidStatusTransition,
    #[msg("courier_id and vehicle_id must both be set or both be empty")]
    InvalidMovementInput,
}
