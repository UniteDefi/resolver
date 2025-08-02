use cosmwasm_std::{Addr, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Immutables {
    pub order_hash: String,
    pub hashlock: String,
    pub maker: Addr,
    pub taker: Addr,
    pub token: String,
    pub amount: Uint128,
    pub safety_deposit: Uint128,
    pub timelocks: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub enum EscrowType {
    Source,
    Destination,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub enum State {
    Active,
    Withdrawn,
    Cancelled,
}
