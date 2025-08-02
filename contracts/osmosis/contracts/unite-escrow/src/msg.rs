use cosmwasm_std::{Addr, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use crate::types::{Immutables, EscrowType};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct EscrowInstantiateMsg {
    pub immutables: Immutables,
    pub escrow_type: EscrowType,
    pub src_cancellation_timestamp: Option<u64>,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    AddResolverDeposit {
        resolver: Addr,
        partial_amount: Uint128,
    },
    WithdrawWithSecret {
        secret: String,
        immutables: Immutables,
    },
    Cancel {
        immutables: Immutables,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetEscrowState {},
    GetResolverDeposit { resolver: Addr },
}
