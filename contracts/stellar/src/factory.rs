use soroban_sdk::{
    contract, contractimpl, token, Address, BytesN, Env, Map, Symbol,
    symbol_short
};

#[contract]
pub struct UniteEscrowFactory;

#[contractimpl]
impl UniteEscrowFactory {
    const ESCROWS: Symbol = symbol_short!("escrows");
    const FILLED_AMOUNTS: Symbol = symbol_short!("filled");

    // In Stellar, we can't deploy contracts dynamically like in EVM
    // Instead, we'll store escrow addresses that are pre-deployed
    pub fn register_escrow(env: Env, order_hash: BytesN<32>, escrow_address: Address) {
        let mut escrows: Map<BytesN<32>, Address> = env.storage().instance()
            .get(&Self::ESCROWS)
            .unwrap_or(Map::new(&env));
        
        escrows.set(order_hash, escrow_address);
        env.storage().instance().set(&Self::ESCROWS, &escrows);
        env.storage().instance().extend_ttl(100, 10000);
    }

    pub fn update_filled_amount(env: Env, order_hash: BytesN<32>, additional_amount: i128) {
        let mut filled_amounts: Map<BytesN<32>, i128> = env.storage().instance()
            .get(&Self::FILLED_AMOUNTS)
            .unwrap_or(Map::new(&env));
        
        let current_filled = filled_amounts.get(order_hash.clone()).unwrap_or(0);
        filled_amounts.set(order_hash, current_filled + additional_amount);
        env.storage().instance().set(&Self::FILLED_AMOUNTS, &filled_amounts);
        env.storage().instance().extend_ttl(100, 10000);
    }

    pub fn get_escrow_address(env: Env, order_hash: BytesN<32>) -> Option<Address> {
        let escrows: Map<BytesN<32>, Address> = env.storage().instance()
            .get(&Self::ESCROWS)
            .unwrap_or(Map::new(&env));
        escrows.get(order_hash)
    }

    pub fn get_total_filled_amount(env: Env, order_hash: BytesN<32>) -> i128 {
        let filled_amounts: Map<BytesN<32>, i128> = env.storage().instance()
            .get(&Self::FILLED_AMOUNTS)
            .unwrap_or(Map::new(&env));
        filled_amounts.get(order_hash).unwrap_or(0)
    }

    pub fn transfer_user_funds(
        env: Env,
        order_hash: BytesN<32>,
        from: Address,
        token: Address,
        amount: i128
    ) {
        from.require_auth();
        
        let escrows: Map<BytesN<32>, Address> = env.storage().instance()
            .get(&Self::ESCROWS)
            .unwrap();
        let escrow_address = escrows.get(order_hash).unwrap();
        
        let token_client = token::Client::new(&env, &token);
        token_client.transfer_from(&env.current_contract_address(), &from, &escrow_address, &amount);
    }
}