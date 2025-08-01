#![no_std]
use soroban_sdk::{contract, contractimpl, Env, Symbol, symbol_short};

const COUNTER: Symbol = symbol_short!("COUNTER");

#[contract]
pub struct CounterContract;

#[contractimpl]
impl CounterContract {
    pub fn increment(env: Env) -> u32 {
        let mut count: u32 = env.storage().instance().get(&COUNTER).unwrap_or(0);
        count += 1;
        env.storage().instance().set(&COUNTER, &count);
        env.storage().instance().extend_ttl(100, 100);
        count
    }

    pub fn decrement(env: Env) -> u32 {
        let mut count: u32 = env.storage().instance().get(&COUNTER).unwrap_or(0);
        if count > 0 {
            count -= 1;
        }
        env.storage().instance().set(&COUNTER, &count);
        env.storage().instance().extend_ttl(100, 100);
        count
    }

    pub fn get_count(env: Env) -> u32 {
        env.storage().instance().get(&COUNTER).unwrap_or(0)
    }
}

#[cfg(test)]
mod test {
    use super::*;
    use soroban_sdk::Env;

    #[test]
    fn test_counter() {
        let env = Env::default();
        let contract_id = env.register_contract(None, CounterContract);
        let client = CounterContractClient::new(&env, &contract_id);

        assert_eq!(client.get_count(), 0);

        assert_eq!(client.increment(), 1);
        assert_eq!(client.get_count(), 1);

        assert_eq!(client.increment(), 2);
        assert_eq!(client.get_count(), 2);

        assert_eq!(client.decrement(), 1);
        assert_eq!(client.get_count(), 1);

        assert_eq!(client.decrement(), 0);
        assert_eq!(client.get_count(), 0);

        assert_eq!(client.decrement(), 0);
        assert_eq!(client.get_count(), 0);
    }
}