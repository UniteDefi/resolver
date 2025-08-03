use cosmwasm_std::{Addr, Uint128};
use cw_storage_plus::{Item, Map};
use serde::{Deserialize, Serialize};
use crate::types::{Immutables, EscrowType, State};

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct EscrowState {
    pub immutables: Immutables,
    pub escrow_type: EscrowType,
    pub src_cancellation_timestamp: Option<u64>,
    pub state: State,
    pub deployed_at: u64,
    pub total_partial_amount: Uint128,
    pub total_partial_withdrawn: Uint128,
    pub funds_distributed: bool,
    pub user_funded: bool,
    pub factory: Addr,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub struct ResolverDeposit {
    pub partial_amount: Uint128,
    pub safety_deposit: Uint128,
    pub withdrawn: bool,
}

pub const ESCROW_STATE: Item<EscrowState> = Item::new("escrow_state");
pub const RESOLVER_DEPOSITS: Map<&Addr, ResolverDeposit> = Map::new("resolver_deposits");
pub const RESOLVERS: Item<Vec<Addr>> = Item::new("resolvers");
