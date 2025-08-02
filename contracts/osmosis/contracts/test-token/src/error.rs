use cosmwasm_std::StdError;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum ContractError {
    #[error("{0}")]
    Std(#[from] StdError),

    #[error("CW20 Error: {0}")]
    Cw20Error(#[from] cw20_base::ContractError),

    #[error("Unauthorized")]
    Unauthorized {},
}