use cosmwasm_std::{Addr, Uint128};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Order {
    pub salt: u64,
    pub maker: Addr,
    pub receiver: Addr,
    pub maker_asset: String,  // Token denom on source chain
    pub taker_asset: String,  // Token denom on destination chain  
    pub making_amount: Uint128,
    pub taking_amount: Uint128,
    pub deadline: u64,
    pub nonce: u64,
    pub src_chain_id: String,
    pub dst_chain_id: String,
    pub auction_start_time: u64,
    pub auction_end_time: u64,
    pub start_price: Uint128,  // Price per unit with 18 decimals precision
    pub end_price: Uint128,    // Price per unit with 18 decimals precision
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Immutables {
    pub order_hash: String,
    pub hashlock: String,
    pub maker: Addr,
    pub taker: Addr,
    pub token: String,
    pub amount: Uint128,
    pub safety_deposit: Uint128,
    pub timelocks: Timelocks,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Timelocks {
    pub src_withdrawal: u64,
    pub src_public_withdrawal: u64,
    pub src_cancellation: u64,
    pub src_public_cancellation: u64,
    pub dst_withdrawal: u64,
    pub dst_public_withdrawal: u64,
    pub dst_cancellation: u64,
    pub deployed_at: Option<u64>,
}