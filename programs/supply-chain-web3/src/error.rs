use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Signer is not authorized to perform this action")]
    Unauthorized,
}
