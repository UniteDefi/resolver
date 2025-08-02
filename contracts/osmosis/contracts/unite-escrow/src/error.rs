use cosmwasm_std::{OverflowError, StdError};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Overflow error: {0}")]
    Overflow(#[from] OverflowError),

    #[error("Resolver already exists")]
    ResolverAlreadyExists {},

    #[error("No safety deposit provided")]
    NoSafetyDeposit {},

    #[error("Invalid state")]
    InvalidState {},

    #[error("Invalid immutables")]
    InvalidImmutables {},

    #[error("Invalid secret")]
    InvalidSecret {},

    #[error("Already withdrawn")]
    AlreadyWithdrawn {},

    #[error("Unauthorized")]
    Unauthorized {},
}
