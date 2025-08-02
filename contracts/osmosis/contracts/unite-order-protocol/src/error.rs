use cosmwasm_std::{OverflowError, StdError};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("Overflow error: {0}")]
    Overflow(#[from] OverflowError),

    #[error("Serialization error: {0}")]
    SerdeJson(#[from] serde_json::Error),

    #[error("Order expired")]
    OrderExpired {},

    #[error("Invalid nonce")]
    InvalidNonce {},

    #[error("Order fully filled")]
    OrderFullyFilled {},

    #[error("Unauthorized")]
    Unauthorized {},
}
