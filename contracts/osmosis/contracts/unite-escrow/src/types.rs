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

impl Timelocks {
    pub fn set_deployed_at(&mut self, deployed_at: u64) {
        self.deployed_at = Some(deployed_at);
    }
    
    pub fn get_deployed_at(&self) -> u64 {
        self.deployed_at.unwrap_or(0)
    }
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

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct ResolverInfo {
    pub address: Addr,
    pub partial_amount: Uint128,
    pub safety_deposit: Uint128,
    pub withdrawn: bool,
}
