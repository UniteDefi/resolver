use soroban_sdk::{
    contract, contractimpl, token, Address, BytesN, Env, Map, Symbol, Vec,
    symbol_short, panic_with_error
};

use crate::types::{Error, State, Immutables, Timelocks, CALLER_REWARD_PERCENTAGE};

// Storage keys
const STATE: Symbol = symbol_short!("state");
const ORDER_HASH: Symbol = symbol_short!("orhash");
const HASHLOCK: Symbol = symbol_short!("hashlock");
const MAKER: Symbol = symbol_short!("maker");
const TAKER: Symbol = symbol_short!("taker");
const TOKEN: Symbol = symbol_short!("token");
const AMOUNT: Symbol = symbol_short!("amount");
const SAFETY_DEPOSIT: Symbol = symbol_short!("safdep");
const TIMELOCKS: Symbol = symbol_short!("tlocks");
const IS_SOURCE: Symbol = symbol_short!("issrc");
const SRC_CANCEL_TS: Symbol = symbol_short!("srcts");
const FACTORY: Symbol = symbol_short!("factory");
const DEPLOYED_AT: Symbol = symbol_short!("depat");
const RESOLVERS: Symbol = symbol_short!("rslvrs");
const RESOLVER_AMOUNTS: Symbol = symbol_short!("rslamt");
const RESOLVER_DEPOSITS: Symbol = symbol_short!("rsldep");
const TOTAL_PARTIAL: Symbol = symbol_short!("totpar");
const FUNDS_DISTRIBUTED: Symbol = symbol_short!("fundist");

#[contract]
pub struct UniteEscrow;

#[contractimpl]
impl UniteEscrow {
    pub fn initialize(env: Env, immutables: Immutables, is_source: bool) {
        if env.storage().instance().has(&ORDER_HASH) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }

        let current_time = env.ledger().timestamp();
        
        env.storage().instance().set(&ORDER_HASH, &immutables.order_hash);
        env.storage().instance().set(&HASHLOCK, &immutables.hashlock);
        env.storage().instance().set(&MAKER, &immutables.maker);
        env.storage().instance().set(&TAKER, &immutables.taker);
        env.storage().instance().set(&TOKEN, &immutables.token);
        env.storage().instance().set(&AMOUNT, &immutables.amount);
        env.storage().instance().set(&SAFETY_DEPOSIT, &immutables.safety_deposit);
        env.storage().instance().set(&TIMELOCKS, &immutables.timelocks);
        env.storage().instance().set(&IS_SOURCE, &is_source);
        env.storage().instance().set(&STATE, &State::Active);
        env.storage().instance().set(&FACTORY, &env.current_contract_address());
        env.storage().instance().set(&DEPLOYED_AT, &current_time);
        env.storage().instance().set(&RESOLVERS, &Vec::<Address>::new(&env));
        env.storage().instance().set(&RESOLVER_AMOUNTS, &Map::<Address, i128>::new(&env));
        env.storage().instance().set(&RESOLVER_DEPOSITS, &Map::<Address, i128>::new(&env));
        env.storage().instance().set(&TOTAL_PARTIAL, &0i128);
        env.storage().instance().set(&FUNDS_DISTRIBUTED, &false);
        
        env.storage().instance().extend_ttl(100, 10000);
    }

    pub fn initialize_dst(env: Env, immutables: Immutables, src_cancellation_timestamp: u64) {
        if env.storage().instance().has(&ORDER_HASH) {
            panic_with_error!(&env, Error::AlreadyInitialized);
        }

        let current_time = env.ledger().timestamp();
        
        env.storage().instance().set(&ORDER_HASH, &immutables.order_hash);
        env.storage().instance().set(&HASHLOCK, &immutables.hashlock);
        env.storage().instance().set(&MAKER, &immutables.maker);
        env.storage().instance().set(&TAKER, &immutables.taker);
        env.storage().instance().set(&TOKEN, &immutables.token);
        env.storage().instance().set(&AMOUNT, &immutables.amount);
        env.storage().instance().set(&SAFETY_DEPOSIT, &immutables.safety_deposit);
        env.storage().instance().set(&TIMELOCKS, &immutables.timelocks);
        env.storage().instance().set(&IS_SOURCE, &false);
        env.storage().instance().set(&SRC_CANCEL_TS, &src_cancellation_timestamp);
        env.storage().instance().set(&STATE, &State::Active);
        env.storage().instance().set(&FACTORY, &env.current_contract_address());
        env.storage().instance().set(&DEPLOYED_AT, &current_time);
        env.storage().instance().set(&RESOLVERS, &Vec::<Address>::new(&env));
        env.storage().instance().set(&RESOLVER_AMOUNTS, &Map::<Address, i128>::new(&env));
        env.storage().instance().set(&RESOLVER_DEPOSITS, &Map::<Address, i128>::new(&env));
        env.storage().instance().set(&TOTAL_PARTIAL, &0i128);
        env.storage().instance().set(&FUNDS_DISTRIBUTED, &false);
        
        env.storage().instance().extend_ttl(100, 10000);
    }

    pub fn add_resolver_safety_deposit(env: Env, resolver: Address, partial_amount: i128) {
        if !env.storage().instance().has(&ORDER_HASH) {
            panic_with_error!(&env, Error::NotInitialized);
        }

        let mut resolver_amounts: Map<Address, i128> = env.storage().instance().get(&RESOLVER_AMOUNTS).unwrap();
        if resolver_amounts.contains_key(resolver.clone()) {
            panic_with_error!(&env, Error::ResolverAlreadyAdded);
        }

        if partial_amount <= 0 {
            panic_with_error!(&env, Error::InvalidAmount);
        }

        let safety_deposit: i128 = env.storage().instance().get(&SAFETY_DEPOSIT).unwrap();

        let mut resolvers: Vec<Address> = env.storage().instance().get(&RESOLVERS).unwrap();
        let mut resolver_deposits: Map<Address, i128> = env.storage().instance().get(&RESOLVER_DEPOSITS).unwrap();
        let total_partial: i128 = env.storage().instance().get(&TOTAL_PARTIAL).unwrap();

        resolvers.push_back(resolver.clone());
        resolver_amounts.set(resolver.clone(), partial_amount);
        resolver_deposits.set(resolver.clone(), safety_deposit);
        
        env.storage().instance().set(&RESOLVERS, &resolvers);
        env.storage().instance().set(&RESOLVER_AMOUNTS, &resolver_amounts);
        env.storage().instance().set(&RESOLVER_DEPOSITS, &resolver_deposits);
        env.storage().instance().set(&TOTAL_PARTIAL, &(total_partial + partial_amount));
        
        env.storage().instance().extend_ttl(100, 10000);
    }

    pub fn withdraw_with_secret(env: Env, secret: BytesN<32>, immutables: Immutables) {
        Self::check_active(&env);
        
        let hashlock: BytesN<32> = env.storage().instance().get(&HASHLOCK).unwrap();
        // Convert BytesN to Bytes for hashing
        let mut secret_bytes = soroban_sdk::Bytes::new(&env);
        for byte in secret.to_array().iter() {
            secret_bytes.append(&soroban_sdk::Bytes::from_array(&env, &[*byte]));
        }
        let computed_hash = env.crypto().sha256(&secret_bytes);
        // Compare the hash arrays directly
        if computed_hash.to_array() != hashlock.to_array() {
            panic_with_error!(&env, Error::InvalidSecret);
        }

        Self::verify_immutables(&env, &immutables);

        let funds_distributed: bool = env.storage().instance().get(&FUNDS_DISTRIBUTED).unwrap();
        if funds_distributed {
            panic_with_error!(&env, Error::AlreadyWithdrawn);
        }

        let is_source: bool = env.storage().instance().get(&IS_SOURCE).unwrap();
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token);

        if !is_source {
            let total_partial: i128 = env.storage().instance().get(&TOTAL_PARTIAL).unwrap();
            let current_balance = token_client.balance(&env.current_contract_address());
            if current_balance < total_partial {
                panic_with_error!(&env, Error::NotAllResolversDeposited);
            }
        }

        let caller_reward = Self::calculate_caller_reward(&env);

        env.storage().instance().set(&FUNDS_DISTRIBUTED, &true);

        if is_source {
            Self::distribute_source_funds(&env, caller_reward);
        } else {
            Self::distribute_destination_funds(&env, caller_reward);
        }

        env.storage().instance().set(&STATE, &State::Withdrawn);
        env.storage().instance().extend_ttl(100, 10000);
    }

    pub fn cancel(env: Env, immutables: Immutables) {
        Self::check_active(&env);
        Self::verify_immutables(&env, &immutables);

        let current_time = env.ledger().timestamp();
        let deployed_at: u64 = env.storage().instance().get(&DEPLOYED_AT).unwrap();
        let timelocks_encoded: u128 = env.storage().instance().get(&TIMELOCKS).unwrap();
        let timelocks = Timelocks::decode(timelocks_encoded, deployed_at);
        let is_source: bool = env.storage().instance().get(&IS_SOURCE).unwrap();
        let maker: Address = env.storage().instance().get(&MAKER).unwrap();

        if is_source {
            let cancellation_time = deployed_at + timelocks.src_cancellation;
            let public_cancellation_time = deployed_at + timelocks.src_public_cancellation;

            if current_time < cancellation_time {
                panic_with_error!(&env, Error::InvalidTime);
            }

            if current_time < public_cancellation_time && env.current_contract_address() != maker {
                panic_with_error!(&env, Error::InvalidCaller);
            }
        } else {
            let src_cancel_ts: u64 = env.storage().instance().get(&SRC_CANCEL_TS).unwrap_or(u64::MAX);
            if current_time < src_cancel_ts {
                panic_with_error!(&env, Error::InvalidTime);
            }

            let cancellation_time = deployed_at + timelocks.dst_cancellation;
            if current_time < cancellation_time {
                panic_with_error!(&env, Error::InvalidTime);
            }
        }

        env.storage().instance().set(&STATE, &State::Cancelled);

        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token);
        let contract_balance = token_client.balance(&env.current_contract_address());

        if contract_balance > 0 {
            token_client.transfer(&env.current_contract_address(), &maker, &contract_balance);
        }

        env.storage().instance().extend_ttl(100, 10000);
    }

    // Helper functions
    fn check_active(env: &Env) {
        let state: State = env.storage().instance().get(&STATE).unwrap();
        match state {
            State::Active => {},
            _ => panic_with_error!(env, Error::InvalidState),
        }
    }

    fn verify_immutables(env: &Env, immutables: &Immutables) {
        let stored_hash: BytesN<32> = env.storage().instance().get(&ORDER_HASH).unwrap();
        let stored_hashlock: BytesN<32> = env.storage().instance().get(&HASHLOCK).unwrap();
        let stored_maker: Address = env.storage().instance().get(&MAKER).unwrap();
        let stored_taker: Address = env.storage().instance().get(&TAKER).unwrap();
        let stored_token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let stored_amount: i128 = env.storage().instance().get(&AMOUNT).unwrap();
        let stored_deposit: i128 = env.storage().instance().get(&SAFETY_DEPOSIT).unwrap();

        if stored_hash != immutables.order_hash ||
           stored_hashlock != immutables.hashlock ||
           stored_maker != immutables.maker ||
           stored_taker != immutables.taker ||
           stored_token != immutables.token ||
           stored_amount != immutables.amount ||
           stored_deposit != immutables.safety_deposit {
            panic_with_error!(env, Error::InvalidImmutables);
        }
    }

    fn calculate_caller_reward(env: &Env) -> i128 {
        let current_time = env.ledger().timestamp();
        let deployed_at: u64 = env.storage().instance().get(&DEPLOYED_AT).unwrap();
        let timelocks_encoded: u128 = env.storage().instance().get(&TIMELOCKS).unwrap();
        let timelocks = Timelocks::decode(timelocks_encoded, deployed_at);
        let is_source: bool = env.storage().instance().get(&IS_SOURCE).unwrap();
        let maker: Address = env.storage().instance().get(&MAKER).unwrap();

        let is_after_time_limit = if is_source {
            current_time >= deployed_at + timelocks.src_public_withdrawal
        } else {
            current_time >= deployed_at + timelocks.dst_public_withdrawal
        };

        if is_after_time_limit && env.current_contract_address() != maker {
            let resolvers: Vec<Address> = env.storage().instance().get(&RESOLVERS).unwrap();
            let mut is_resolver = false;
            for resolver in resolvers.iter() {
                if resolver == env.current_contract_address() {
                    is_resolver = true;
                    break;
                }
            }

            if !is_resolver {
                let resolver_deposits: Map<Address, i128> = env.storage().instance().get(&RESOLVER_DEPOSITS).unwrap();
                let mut total_deposits = 0i128;
                for (_, deposit) in resolver_deposits.iter() {
                    total_deposits += deposit;
                }
                return (total_deposits * CALLER_REWARD_PERCENTAGE as i128) / 100;
            }
        }

        0
    }

    fn distribute_source_funds(env: &Env, caller_reward: i128) {
        let resolvers: Vec<Address> = env.storage().instance().get(&RESOLVERS).unwrap();
        let resolver_amounts: Map<Address, i128> = env.storage().instance().get(&RESOLVER_AMOUNTS).unwrap();
        let resolver_deposits: Map<Address, i128> = env.storage().instance().get(&RESOLVER_DEPOSITS).unwrap();
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token);

        for resolver in resolvers.iter() {
            let amount = resolver_amounts.get(resolver.clone()).unwrap();
            let deposit = resolver_deposits.get(resolver.clone()).unwrap();

            let _actual_deposit = if caller_reward > 0 {
                let deduction = (deposit * CALLER_REWARD_PERCENTAGE as i128) / 100;
                deposit - deduction
            } else {
                deposit
            };

            token_client.transfer(&env.current_contract_address(), &resolver, &amount);
        }
    }

    fn distribute_destination_funds(env: &Env, caller_reward: i128) {
        let maker: Address = env.storage().instance().get(&MAKER).unwrap();
        let total_partial: i128 = env.storage().instance().get(&TOTAL_PARTIAL).unwrap();
        let token: Address = env.storage().instance().get(&TOKEN).unwrap();
        let token_client = token::Client::new(&env, &token);

        token_client.transfer(&env.current_contract_address(), &maker, &total_partial);

        let resolvers: Vec<Address> = env.storage().instance().get(&RESOLVERS).unwrap();
        let resolver_deposits: Map<Address, i128> = env.storage().instance().get(&RESOLVER_DEPOSITS).unwrap();

        for resolver in resolvers.iter() {
            let deposit = resolver_deposits.get(resolver.clone()).unwrap();
            let _actual_deposit = if caller_reward > 0 {
                let deduction = (deposit * CALLER_REWARD_PERCENTAGE as i128) / 100;
                deposit - deduction
            } else {
                deposit
            };
        }
    }

    pub fn get_state(env: Env) -> State {
        env.storage().instance().get(&STATE).unwrap_or(State::Active)
    }

    pub fn get_order_hash(env: Env) -> BytesN<32> {
        env.storage().instance().get(&ORDER_HASH).unwrap()
    }

    pub fn get_resolver_info(env: Env, resolver: Address) -> (i128, i128, bool) {
        let resolver_amounts: Map<Address, i128> = env.storage().instance().get(&RESOLVER_AMOUNTS).unwrap_or(Map::new(&env));
        let resolver_deposits: Map<Address, i128> = env.storage().instance().get(&RESOLVER_DEPOSITS).unwrap_or(Map::new(&env));
        let funds_distributed: bool = env.storage().instance().get(&FUNDS_DISTRIBUTED).unwrap_or(false);

        let amount = resolver_amounts.get(resolver.clone()).unwrap_or(0);
        let deposit = resolver_deposits.get(resolver.clone()).unwrap_or(0);

        (amount, deposit, funds_distributed)
    }
}