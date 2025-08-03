use core::hash::{HashStateTrait, HashStateExTrait};
use core::poseidon::PoseidonTrait;
use crate::interfaces::ibase_escrow::Immutables;

pub fn hash_immutables(immutables: @Immutables) -> felt252 {
    let mut state = PoseidonTrait::new();
    state = state.update(*immutables.order_hash);
    state = state.update(*immutables.hashlock);
    state = state.update((*immutables.maker).into());
    state = state.update((*immutables.taker).into());
    state = state.update((*immutables.token).into());
    state = state.update((*immutables.amount).low.into());
    state = state.update((*immutables.amount).high.into());
    state = state.update((*immutables.safety_deposit).low.into());
    state = state.update((*immutables.safety_deposit).high.into());
    state = state.update((*immutables.timelocks).low.into());
    state = state.update((*immutables.timelocks).high.into());
    state.finalize()
}
