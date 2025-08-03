use cosmwasm_std::{Addr, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use crate::types::{Order, Immutables};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub struct InstantiateMsg {
    pub factory: Addr,
    pub order_protocol: Addr,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    DeploySrc {
        immutables: Immutables,
        order: Order,
        signature: String,
        amount: Uint128,
    },
    DeploySrcPartial {
        immutables: Immutables,
        order: Order,
        signature: String,
        amount: Uint128,
        partial_amount: Uint128,
    },
    DeployDst {
        immutables: Immutables,
        src_cancellation_timestamp: u64,
    },
    DeployDstPartial {
        immutables: Immutables,
        src_cancellation_timestamp: u64,
        partial_amount: Uint128,
    },
    FillOrder {
        immutables: Immutables,
        order: Order,
        src_cancellation_timestamp: u64,
        src_amount: Uint128,
    },
    ApproveToken {
        token: String,
        amount: Uint128,
    },
    Withdraw {
        escrow: Addr,
        secret: String,
        immutables: Immutables,
    },
    Cancel {
        escrow: Addr,
        immutables: Immutables,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetConfig {},
    GetOrderHash { order: Order },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ConfigResponse {
    pub owner: Addr,
    pub factory: Addr,
    pub order_protocol: Addr,
}