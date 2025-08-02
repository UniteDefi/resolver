use core::hash::{HashStateTrait, HashStateExTrait};
use core::poseidon::PoseidonTrait;
use super::super::interfaces::iunite_order::Order;

fn hash_order(order: @Order) -> felt252 {
    let mut state = PoseidonTrait::new();
    state = state.update((*order.salt).low.into());
    state = state.update((*order.salt).high.into());
    state = state.update((*order.maker).into());
    state = state.update((*order.receiver).into());
    state = state.update((*order.maker_asset).into());
    state = state.update((*order.taker_asset).into());
    state = state.update((*order.making_amount).low.into());
    state = state.update((*order.making_amount).high.into());
    state = state.update((*order.taking_amount).low.into());
    state = state.update((*order.taking_amount).high.into());
    state = state.update((*order.deadline).into());
    state = state.update((*order.nonce).low.into());
    state = state.update((*order.nonce).high.into());
    state = state.update((*order.src_chain_id).low.into());
    state = state.update((*order.src_chain_id).high.into());
    state = state.update((*order.dst_chain_id).low.into());
    state = state.update((*order.dst_chain_id).high.into());
    state = state.update((*order.auction_start_time).into());
    state = state.update((*order.auction_end_time).into());
    state = state.update((*order.start_price).low.into());
    state = state.update((*order.start_price).high.into());
    state = state.update((*order.end_price).low.into());
    state = state.update((*order.end_price).high.into());
    state.finalize()
}
