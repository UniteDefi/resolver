use cosmwasm_std::Addr;
use cw_storage_plus::{Item, Map};
use schemars::JsonSchema;
use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq, JsonSchema)]
pub struct Config {
    pub owner: Addr,
    pub factory: Addr,
    pub order_protocol: Addr,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const ORDER_FILLS: Map<String, u128> = Map::new("order_fills");
pub const ESCROW_ADDRESSES: Map<String, Addr> = Map::new("escrow_addresses");