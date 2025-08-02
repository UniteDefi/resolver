use cosmwasm_std::{Addr, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};
use crate::types::{Order, OrderStatus};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct InstantiateMsg {}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum ExecuteMsg {
    CreateOrder {
        order: Order,
        signature: String,
    },
    FillOrder {
        order_hash: String,
        making_amount: Uint128,
        taking_amount: Uint128,
        target: Option<Addr>,
    },
    CancelOrder {
        order_hash: String,
    },
    SetEscrowFactory {
        address: Addr,
    },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
#[serde(rename_all = "snake_case")]
pub enum QueryMsg {
    GetOrder { order_hash: String },
    GetOrderHash { order: Order },
    GetFilledAmount { order_hash: String },
    GetNonce { maker: Addr },
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct OrderResponse {
    pub order: Order,
    pub filled_amount: Uint128,
    pub status: OrderStatus,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct OrderHashResponse {
    pub hash: String,
}
