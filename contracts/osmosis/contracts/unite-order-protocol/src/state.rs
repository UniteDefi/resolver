use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::{Item, Map};
use serde::{Deserialize, Serialize};
use crate::types::Order;

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct Config {
    pub admin: Addr,
    pub escrow_factory: Option<Addr>,
}

pub const CONFIG: Item<Config> = Item::new("config");
pub const ORDERS: Map<String, Order> = Map::new("orders");
pub const NONCES: Map<&Addr, Uint128> = Map::new("nonces");
pub const FILLED_AMOUNTS: Map<String, Uint128> = Map::new("filled_amounts");
pub const ESCROW_ADDRESSES: Map<String, Addr> = Map::new("escrow_addresses");
