use cosmwasm_std::{Addr, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Order {
    pub salt: Uint128,
    pub maker: Addr,
    pub receiver: Option<Addr>,
    pub maker_asset: String,
    pub taker_asset: String,
    pub making_amount: Uint128,
    pub taking_amount: Uint128,
    pub deadline: u64,
    pub nonce: Uint128,
    pub src_chain_id: u64,
    pub dst_chain_id: u64,
    pub auction_start_time: u64,
    pub auction_end_time: u64,
    pub start_price: Uint128,
    pub end_price: Uint128,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub enum OrderStatus {
    Open,
    PartiallyFilled,
    Filled,
    Cancelled,
}
