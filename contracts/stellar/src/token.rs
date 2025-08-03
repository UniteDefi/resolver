use soroban_sdk::{
    contract, contractimpl, Address, Env, String, symbol_short, panic_with_error
};

use crate::types::Error;

#[contract]
pub struct MockToken;

#[contractimpl]
impl MockToken {
    pub fn init(env: Env, admin: Address, decimal: u32, name: String, symbol: String) {
        let storage = env.storage().instance();
        storage.set(&symbol_short!("admin"), &admin);
        storage.set(&symbol_short!("decimal"), &decimal);
        storage.set(&symbol_short!("name"), &name);
        storage.set(&symbol_short!("symbol"), &symbol);
        storage.extend_ttl(100, 10000);
    }

    pub fn mint(env: Env, to: Address, amount: i128) {
        let admin: Address = env.storage().instance().get(&symbol_short!("admin")).unwrap();
        admin.require_auth();
        
        let balance_key = to.clone();
        let current = env.storage().persistent()
            .get::<Address, i128>(&balance_key)
            .unwrap_or(0);
        
        env.storage().persistent().set(&balance_key, &(current + amount));
        env.storage().persistent().extend_ttl(&balance_key, 100, 10000);
    }

    pub fn balance(env: Env, id: Address) -> i128 {
        env.storage().persistent()
            .get::<Address, i128>(&id)
            .unwrap_or(0)
    }

    pub fn transfer(env: Env, from: Address, to: Address, amount: i128) {
        from.require_auth();
        
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic_with_error!(&env, Error::InsufficientBalance);
        }
        
        env.storage().persistent().set(&from, &(from_balance - amount));
        
        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&to, &(to_balance + amount));
        
        env.storage().persistent().extend_ttl(&from, 100, 10000);
        env.storage().persistent().extend_ttl(&to, 100, 10000);
    }

    pub fn approve(env: Env, from: Address, spender: Address, amount: i128) {
        from.require_auth();
        
        let allowance_key = (from.clone(), spender.clone());
        env.storage().persistent().set(&allowance_key, &amount);
        env.storage().persistent().extend_ttl(&allowance_key, 100, 10000);
    }

    pub fn allowance(env: Env, from: Address, spender: Address) -> i128 {
        let allowance_key = (from, spender);
        env.storage().persistent()
            .get::<(Address, Address), i128>(&allowance_key)
            .unwrap_or(0)
    }

    pub fn transfer_from(env: Env, spender: Address, from: Address, to: Address, amount: i128) {
        spender.require_auth();
        
        let allowance = Self::allowance(env.clone(), from.clone(), spender.clone());
        if allowance < amount {
            panic_with_error!(&env, Error::InsufficientBalance);
        }
        
        let from_balance = Self::balance(env.clone(), from.clone());
        if from_balance < amount {
            panic_with_error!(&env, Error::InsufficientBalance);
        }
        
        let allowance_key = (from.clone(), spender);
        env.storage().persistent().set(&allowance_key, &(allowance - amount));
        
        env.storage().persistent().set(&from, &(from_balance - amount));
        
        let to_balance = Self::balance(env.clone(), to.clone());
        env.storage().persistent().set(&to, &(to_balance + amount));
        
        env.storage().persistent().extend_ttl(&allowance_key, 100, 10000);
        env.storage().persistent().extend_ttl(&from, 100, 10000);
        env.storage().persistent().extend_ttl(&to, 100, 10000);
    }
}