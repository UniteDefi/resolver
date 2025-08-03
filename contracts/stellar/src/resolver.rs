use soroban_sdk::{
    contract, contractimpl, token, Address, BytesN, Env,
    log, panic_with_error
};

use crate::types::{Error, Immutables, Order, EVM_DECIMAL_FACTOR, DECIMAL_FACTOR};

#[contract]
pub struct UniteResolver;

#[contractimpl]
impl UniteResolver {
    pub fn calculate_current_price(env: Env, start_price: u128, end_price: u128, start_time: u64, end_time: u64) -> u128 {
        let current_time = env.ledger().timestamp();
        
        if current_time <= start_time {
            return start_price;
        }
        if current_time >= end_time {
            return end_price;
        }

        let elapsed = current_time - start_time;
        let duration = end_time - start_time;
        let price_diff = start_price - end_price;

        start_price - (price_diff * elapsed as u128) / duration as u128
    }

    pub fn calculate_taking_amount(
        env: Env,
        making_amount: u128,
        start_price: u128,
        end_price: u128,
        start_time: u64,
        end_time: u64
    ) -> u128 {
        let current_price = Self::calculate_current_price(env.clone(), start_price, end_price, start_time, end_time);
        (making_amount * current_price) / EVM_DECIMAL_FACTOR as u128
    }

    pub fn fill_order(
        env: Env,
        escrow_factory: Address,
        immutables: Immutables,
        order: Order,
        _src_cancellation_timestamp: u64,
        src_amount: u128
    ) {
        if src_amount == 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let dest_amount = Self::calculate_taking_amount(
            env.clone(),
            src_amount,
            order.start_price,
            order.end_price,
            order.auction_start_time,
            order.auction_end_time
        );

        let stellar_dest_amount = (dest_amount as i128 * DECIMAL_FACTOR) / EVM_DECIMAL_FACTOR;

        log!(&env, "Fill order: src_amount={}, dest_amount={}, stellar_amount={}", 
             src_amount, dest_amount, stellar_dest_amount);

        let token_client = token::Client::new(&env, &immutables.token);
        // The invoker should have pre-authorized this transfer
        token_client.transfer(&escrow_factory, &escrow_factory, &stellar_dest_amount);
    }

    pub fn hash_order(env: Env, order: Order) -> BytesN<32> {
        // For cross-chain compatibility, we need to carefully construct the hash
        // In production, this would need to match EVM's keccak256 exactly
        
        // Create a Bytes object to hold all data
        let mut data = soroban_sdk::Bytes::new(&env);
        
        // Append all order fields as bytes
        // Salt
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.salt.to_be_bytes()));
        
        // Addresses (already 32 bytes)
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.maker.to_array()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.receiver.to_array()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.maker_asset.to_array()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.taker_asset.to_array()));
        
        // Amounts
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.making_amount.to_be_bytes()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.taking_amount.to_be_bytes()));
        
        // Timestamps and other fields
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.deadline.to_be_bytes()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.nonce.to_be_bytes()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.src_chain_id.to_be_bytes()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.dst_chain_id.to_be_bytes()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.auction_start_time.to_be_bytes()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.auction_end_time.to_be_bytes()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.start_price.to_be_bytes()));
        data.append(&soroban_sdk::Bytes::from_array(&env, &order.end_price.to_be_bytes()));

        let hash = env.crypto().sha256(&data);
        BytesN::from_array(&env, &hash.to_array())
    }
}