use cosmwasm_std::{Addr, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use crate::types::{Immutables, EscrowType, State};

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
    Initialize {
        immutables: Immutables,
        is_source: bool,
    },
    InitializeDst {
        immutables: Immutables,
        src_cancellation_timestamp: u64,
    },
    AddResolverSafetyDeposit {
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
    HandleFirstResolver {
        resolver: Addr,
        partial_amount: Uint128,
        resolver_deposit: Uint128,
    },
    MarkUserFunded {},
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetEscrowState {},
    GetResolverCount {},
    GetResolver { index: u32 },
    GetResolverInfo { resolver: Addr },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct EscrowStateResponse {
    pub order_hash: String,
    pub hashlock: String,
    pub maker: Addr,
    pub taker: Addr,
    pub token: String,
    pub amount: Uint128,
    pub safety_deposit: Uint128,
    pub timelocks: Timelocks,
    pub is_source: bool,
    pub src_cancellation_timestamp: Option<u64>,
    pub state: State,
    pub total_partial_amount: Uint128,
    pub total_partial_withdrawn: Uint128,
    pub funds_distributed: bool,
    pub user_funded: bool,
    pub factory: Addr,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ResolverInfoResponse {
    pub partial_amount: Uint128,
    pub safety_deposit: Uint128,
    pub withdrawn: bool,
}

use crate::types::Timelocks;
