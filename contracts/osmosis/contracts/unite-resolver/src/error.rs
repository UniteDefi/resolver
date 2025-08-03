use cosmwasm_std::{StdError, OverflowError};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Overflow error: {0}")]
    Overflow(#[from] OverflowError),

    #[error("Unauthorized")]
    Unauthorized {},

    #[error("No safety deposit provided")]
    NoSafetyDeposit {},

    #[error("Invalid source amount")]
    InvalidSrcAmount {},

    #[error("Order completed")]
    OrderCompleted {},

    #[error("Unknown reply id: {id}")]
    UnknownReplyId { id: u64 },
}