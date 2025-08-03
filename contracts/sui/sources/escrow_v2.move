module unite::escrow_v2 {
    use std::vector;
    use std::option::{Self, Option};
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::balance::{Self, Balance};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::dynamic_field;
    use std::hash;

    // === Errors ===
    const EInvalidSecret: u64 = 1;
    const EAlreadyWithdrawn: u64 = 2;
    const EInvalidTime: u64 = 3;
    const EInvalidCaller: u64 = 4;
    const EAlreadyCancelled: u64 = 5;
    const EInvalidAmount: u64 = 6;
    const EResolverAlreadyExists: u64 = 7;
    const ENotInitialized: u64 = 8;
    const EInsufficientFunds: u64 = 9;
    const EInvalidImmutables: u64 = 10;
    const ENativeTokenSendingFailure: u64 = 11;

    // === Constants ===
    const CALLER_REWARD_PERCENTAGE: u64 = 10; // 10% reward for calling after time limit

    // === Structs ===
    
    /// Immutable parameters matching EVM implementation
    public struct Immutables has store, copy, drop {
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        token: address,
        amount: u256,
        safety_deposit: u256,
        timelocks: u256,
    }
    
    // Getter functions for Immutables
    public fun get_order_hash(immutables: &Immutables): vector<u8> { immutables.order_hash }
    public fun get_hashlock(immutables: &Immutables): vector<u8> { immutables.hashlock }
    public fun get_maker(immutables: &Immutables): address { immutables.maker }
    public fun get_taker(immutables: &Immutables): address { immutables.taker }
    public fun get_token(immutables: &Immutables): address { immutables.token }
    public fun get_amount(immutables: &Immutables): u256 { immutables.amount }
    public fun get_safety_deposit(immutables: &Immutables): u256 { immutables.safety_deposit }
    public fun get_timelocks(immutables: &Immutables): u256 { immutables.timelocks }

    /// State enum
    public struct State has store, copy, drop {
        value: u8, // 0: Active, 1: Withdrawn, 2: Cancelled
    }

    /// Resolver participation info
    public struct ResolverInfo has store, copy, drop {
        resolver: address,
        partial_amount: u64,
        safety_deposit: u64,
        withdrawn: bool,
    }

    /// Unified escrow structure for both SUI and generic coins
    public struct Escrow<phantom T> has key, store {
        id: UID,
        // Immutable storage
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        token: address, // Token type identifier
        amount: u64, // Total order amount
        safety_deposit: u64, // Per-resolver safety deposit
        timelocks: u256,
        is_source: bool,
        src_cancellation_timestamp: Option<u64>,
        
        // State
        state: State,
        deployed_at: u64,
        
        // Partial filling support
        resolvers: vector<ResolverInfo>,
        total_partial_amount: u64,
        total_partial_withdrawn: u64,
        funds_distributed: bool,
        user_funded: bool,
        
        // Balances
        token_balance: Balance<T>,
        safety_deposits: Balance<SUI>,
    }

    // === Events ===
    
    public struct EscrowCreated has copy, drop {
        escrow_id: ID,
        order_hash: vector<u8>,
        is_source: bool,
        maker: address,
        amount: u64,
    }

    public struct ResolverAdded has copy, drop {
        escrow_id: ID,
        resolver: address,
        partial_amount: u64,
        safety_deposit: u64,
    }

    public struct FundsDistributed has copy, drop {
        escrow_id: ID,
        caller: address,
        after_time_limit: bool,
    }

    public struct CallerRewarded has copy, drop {
        escrow_id: ID,
        caller: address,
        reward: u64,
    }

    public struct Withdrawn has copy, drop {
        escrow_id: ID,
        recipient: address,
        amount: u64,
    }

    public struct Cancelled has copy, drop {
        escrow_id: ID,
        maker: address,
        amount: u64,
    }

    // === Helper Functions ===
    
    fun active_state(): State { State { value: 0 } }
    fun withdrawn_state(): State { State { value: 1 } }
    fun cancelled_state(): State { State { value: 2 } }
    
    fun is_active(state: &State): bool { state.value == 0 }
    fun is_withdrawn(state: &State): bool { state.value == 1 }
    fun is_cancelled(state: &State): bool { state.value == 2 }

    // === Public Functions ===

    /// Initialize escrow for source chain
    public fun initialize<T>(
        immutables: Immutables,
        is_source: bool,
        clock: &Clock,
        ctx: &mut TxContext
    ): Escrow<T> {
        let current_time = clock::timestamp_ms(clock) / 1000;
        
        Escrow<T> {
            id: object::new(ctx),
            order_hash: immutables.order_hash,
            hashlock: immutables.hashlock,
            maker: immutables.maker,
            taker: immutables.taker,
            token: immutables.token,
            amount: (immutables.amount as u64),
            safety_deposit: (immutables.safety_deposit as u64),
            timelocks: immutables.timelocks,
            is_source,
            src_cancellation_timestamp: option::none(),
            state: active_state(),
            deployed_at: current_time,
            resolvers: vector::empty(),
            total_partial_amount: 0,
            total_partial_withdrawn: 0,
            funds_distributed: false,
            user_funded: false,
            token_balance: balance::zero(),
            safety_deposits: balance::zero(),
        }
    }

    /// Initialize escrow for destination chain
    public fun initialize_dst<T>(
        immutables: Immutables,
        src_cancellation_timestamp: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ): Escrow<T> {
        let current_time = clock::timestamp_ms(clock) / 1000;
        
        Escrow<T> {
            id: object::new(ctx),
            order_hash: immutables.order_hash,
            hashlock: immutables.hashlock,
            maker: immutables.maker,
            taker: immutables.taker,
            token: immutables.token,
            amount: (immutables.amount as u64),
            safety_deposit: (immutables.safety_deposit as u64),
            timelocks: immutables.timelocks,
            is_source: false,
            src_cancellation_timestamp: option::some(src_cancellation_timestamp),
            state: active_state(),
            deployed_at: current_time,
            resolvers: vector::empty(),
            total_partial_amount: 0,
            total_partial_withdrawn: 0,
            funds_distributed: false,
            user_funded: false,
            token_balance: balance::zero(),
            safety_deposits: balance::zero(),
        }
    }

    /// Handle first resolver during initialization (called by factory)
    public fun handle_first_resolver<T>(
        escrow: &mut Escrow<T>,
        resolver: address,
        partial_amount: u64,
        resolver_deposit: u64
    ) {
        assert!(vector::length(&escrow.resolvers) == 0, EResolverAlreadyExists);
        assert!(partial_amount > 0, EInvalidAmount);
        
        let resolver_info = ResolverInfo {
            resolver,
            partial_amount,
            safety_deposit: resolver_deposit,
            withdrawn: false,
        };
        
        vector::push_back(&mut escrow.resolvers, resolver_info);
        escrow.total_partial_amount = escrow.total_partial_amount + partial_amount;
        
        event::emit(ResolverAdded {
            escrow_id: object::id(escrow),
            resolver,
            partial_amount,
            safety_deposit: resolver_deposit,
        });
    }

    /// Add additional resolver with safety deposit
    public fun add_resolver_safety_deposit<T>(
        escrow: &mut Escrow<T>,
        resolver: address,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        _ctx: &mut TxContext
    ) {
        assert!(is_active(&escrow.state), EInvalidTime);
        assert!(partial_amount > 0, EInvalidAmount);
        assert!(coin::value(&safety_deposit) > 0, EInvalidAmount);
        
        // Check if resolver already exists
        let resolvers_len = vector::length(&escrow.resolvers);
        let mut i = 0;
        while (i < resolvers_len) {
            let resolver_info = vector::borrow(&escrow.resolvers, i);
            assert!(resolver_info.resolver != resolver, EResolverAlreadyExists);
            i = i + 1;
        };

        let resolver_info = ResolverInfo {
            resolver,
            partial_amount,
            safety_deposit: coin::value(&safety_deposit),
            withdrawn: false,
        };

        balance::join(&mut escrow.safety_deposits, coin::into_balance(safety_deposit));
        vector::push_back(&mut escrow.resolvers, resolver_info);
        escrow.total_partial_amount = escrow.total_partial_amount + partial_amount;

        event::emit(ResolverAdded {
            escrow_id: object::id(escrow),
            resolver,
            partial_amount,
            safety_deposit: resolver_info.safety_deposit,
        });
    }

    /// Deposit tokens into escrow
    public fun deposit_tokens<T>(
        escrow: &mut Escrow<T>,
        tokens: Coin<T>,
        _ctx: &mut TxContext
    ) {
        balance::join(&mut escrow.token_balance, coin::into_balance(tokens));
    }
    
    /// Deposit SUI safety deposit into escrow
    public fun deposit_safety_deposit<T>(
        escrow: &mut Escrow<T>,
        safety_deposit: Coin<SUI>,
        _ctx: &mut TxContext
    ) {
        balance::join(&mut escrow.safety_deposits, coin::into_balance(safety_deposit));
    }

    /// Mark user funds as transferred (for source escrows)
    public fun mark_user_funded<T>(escrow: &mut Escrow<T>) {
        escrow.user_funded = true;
    }

    /// Withdraw with secret (permissionless)
    public fun withdraw_with_secret<T>(
        escrow: &mut Escrow<T>,
        secret: vector<u8>,
        immutables: Immutables,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(is_active(&escrow.state), EInvalidTime);
        assert!(!escrow.funds_distributed, EAlreadyWithdrawn);
        
        // Verify secret
        let hash = hash::sha2_256(secret);
        assert!(hash == escrow.hashlock, EInvalidSecret);
        
        // Verify immutables match
        verify_immutables(escrow, &immutables);
        
        // For destination chain, check that all resolvers have deposited
        if (!escrow.is_source) {
            let current_balance = balance::value(&escrow.token_balance);
            assert!(current_balance >= escrow.total_partial_amount, EInsufficientFunds);
        };
        
        let current_time = clock::timestamp_ms(clock) / 1000;
        let caller = tx_context::sender(ctx);
        
        // Check if caller should get reward
        let is_after_time_limit = check_after_time_limit(escrow, current_time);
        
        escrow.funds_distributed = true;
        
        // Calculate caller reward if applicable
        let caller_reward = calculate_caller_reward(escrow, caller, is_after_time_limit);
        
        if (escrow.is_source) {
            distribute_source_funds(escrow, caller_reward, ctx);
        } else {
            distribute_destination_funds(escrow, caller_reward, ctx);
        };
        
        // Send caller reward if applicable
        if (caller_reward > 0) {
            let reward_balance = balance::split(&mut escrow.safety_deposits, caller_reward);
            let reward_coin = coin::from_balance(reward_balance, ctx);
            transfer::public_transfer(reward_coin, caller);
            
            event::emit(CallerRewarded {
                escrow_id: object::id(escrow),
                caller,
                reward: caller_reward,
            });
        };
        
        escrow.state = withdrawn_state();
        
        event::emit(FundsDistributed {
            escrow_id: object::id(escrow),
            caller,
            after_time_limit: is_after_time_limit,
        });
    }

    /// Cancel escrow
    public fun cancel<T>(
        escrow: &mut Escrow<T>,
        immutables: Immutables,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(is_active(&escrow.state), EInvalidTime);
        
        // Verify immutables match
        verify_immutables(escrow, &immutables);
        
        let current_time = clock::timestamp_ms(clock) / 1000;
        let caller = tx_context::sender(ctx);
        
        if (escrow.is_source) {
            // Source chain cancellation
            let (cancellation_time, public_cancellation_time) = get_src_cancellation_times(escrow);
            
            assert!(current_time >= cancellation_time, EInvalidTime);
            if (current_time < public_cancellation_time && caller != escrow.maker) {
                abort EInvalidCaller
            };
        } else {
            // Destination chain cancellation
            let src_cancellation = option::borrow(&escrow.src_cancellation_timestamp);
            assert!(current_time >= *src_cancellation, EInvalidTime);
            
            let cancellation_time = get_dst_cancellation_time(escrow);
            assert!(current_time >= cancellation_time, EInvalidTime);
        };
        
        escrow.state = cancelled_state();
        
        // Return tokens to maker
        let token_balance_value = balance::value(&escrow.token_balance);
        if (token_balance_value > 0) {
            let returned_balance = balance::split(&mut escrow.token_balance, token_balance_value);
            let returned_coin = coin::from_balance(returned_balance, ctx);
            transfer::public_transfer(returned_coin, escrow.maker);
        };
        
        // Return safety deposits to resolvers
        let resolvers_len = vector::length(&escrow.resolvers);
        let mut i = 0;
        while (i < resolvers_len) {
            let resolver_info = vector::borrow(&escrow.resolvers, i);
            if (resolver_info.safety_deposit > 0) {
                let deposit_balance = balance::split(&mut escrow.safety_deposits, resolver_info.safety_deposit);
                let deposit_coin = coin::from_balance(deposit_balance, ctx);
                transfer::public_transfer(deposit_coin, resolver_info.resolver);
            };
            i = i + 1;
        };
        
        event::emit(Cancelled {
            escrow_id: object::id(escrow),
            maker: escrow.maker,
            amount: escrow.amount,
        });
    }

    // === Helper Functions ===
    
    fun verify_immutables<T>(escrow: &Escrow<T>, immutables: &Immutables) {
        assert!(
            immutables.order_hash == escrow.order_hash &&
            immutables.hashlock == escrow.hashlock &&
            immutables.maker == escrow.maker &&
            immutables.taker == escrow.taker &&
            immutables.token == escrow.token &&
            (immutables.amount as u64) == escrow.amount &&
            (immutables.safety_deposit as u64) == escrow.safety_deposit,
            EInvalidImmutables
        );
    }
    
    fun check_after_time_limit<T>(escrow: &Escrow<T>, current_time: u64): bool {
        if (escrow.is_source) {
            let public_withdrawal_time = get_src_public_withdrawal_time(escrow);
            current_time >= public_withdrawal_time
        } else {
            let public_withdrawal_time = get_dst_public_withdrawal_time(escrow);
            current_time >= public_withdrawal_time
        }
    }
    
    fun calculate_caller_reward<T>(escrow: &Escrow<T>, caller: address, is_after_time_limit: bool): u64 {
        if (is_after_time_limit && caller != escrow.maker) {
            // Check if caller is not one of the resolvers
            let mut is_resolver = false;
            let resolvers_len = vector::length(&escrow.resolvers);
            let mut i = 0;
            while (i < resolvers_len) {
                let resolver_info = vector::borrow(&escrow.resolvers, i);
                if (resolver_info.resolver == caller) {
                    is_resolver = true;
                    break
                };
                i = i + 1;
            };
            
            if (!is_resolver) {
                let total_safety_deposits = balance::value(&escrow.safety_deposits);
                (total_safety_deposits * CALLER_REWARD_PERCENTAGE) / 100
            } else {
                0
            }
        } else {
            0
        }
    }
    
    fun distribute_source_funds<T>(
        escrow: &mut Escrow<T>,
        caller_reward: u64,
        ctx: &mut TxContext
    ) {
        let resolvers_len = vector::length(&escrow.resolvers);
        let mut i = 0;
        
        while (i < resolvers_len) {
            let resolver_info = vector::borrow(&escrow.resolvers, i);
            
            // Calculate safety deposit after caller reward deduction
            let actual_deposit = if (caller_reward > 0) {
                let deduction = (resolver_info.safety_deposit * CALLER_REWARD_PERCENTAGE) / 100;
                resolver_info.safety_deposit - deduction
            } else {
                resolver_info.safety_deposit
            };
            
            // Send tokens to resolver
            if (resolver_info.partial_amount > 0) {
                let token_balance = balance::split(&mut escrow.token_balance, resolver_info.partial_amount);
                let token_coin = coin::from_balance(token_balance, ctx);
                transfer::public_transfer(token_coin, resolver_info.resolver);
            };
            
            // Return safety deposit
            if (actual_deposit > 0) {
                let deposit_balance = balance::split(&mut escrow.safety_deposits, actual_deposit);
                let deposit_coin = coin::from_balance(deposit_balance, ctx);
                transfer::public_transfer(deposit_coin, resolver_info.resolver);
            };
            
            event::emit(Withdrawn {
                escrow_id: object::id(escrow),
                recipient: resolver_info.resolver,
                amount: resolver_info.partial_amount,
            });
            
            i = i + 1;
        };
    }
    
    fun distribute_destination_funds<T>(
        escrow: &mut Escrow<T>,
        caller_reward: u64,
        ctx: &mut TxContext
    ) {
        // Send all tokens to user (maker)
        let total_tokens = balance::value(&escrow.token_balance);
        if (total_tokens > 0) {
            let user_balance = balance::split(&mut escrow.token_balance, total_tokens);
            let user_coin = coin::from_balance(user_balance, ctx);
            transfer::public_transfer(user_coin, escrow.maker);
            
            event::emit(Withdrawn {
                escrow_id: object::id(escrow),
                recipient: escrow.maker,
                amount: total_tokens,
            });
        };
        
        // Return safety deposits to resolvers (minus caller reward)
        let resolvers_len = vector::length(&escrow.resolvers);
        let mut i = 0;
        
        while (i < resolvers_len) {
            let resolver_info = vector::borrow(&escrow.resolvers, i);
            
            // Calculate safety deposit after caller reward deduction
            let actual_deposit = if (caller_reward > 0) {
                let deduction = (resolver_info.safety_deposit * CALLER_REWARD_PERCENTAGE) / 100;
                resolver_info.safety_deposit - deduction
            } else {
                resolver_info.safety_deposit
            };
            
            if (actual_deposit > 0) {
                let deposit_balance = balance::split(&mut escrow.safety_deposits, actual_deposit);
                let deposit_coin = coin::from_balance(deposit_balance, ctx);
                transfer::public_transfer(deposit_coin, resolver_info.resolver);
            };
            
            i = i + 1;
        };
    }
    
    // === Timelock Helper Functions ===
    
    fun get_src_public_withdrawal_time<T>(escrow: &Escrow<T>): u64 {
        let src_public_withdrawal = ((escrow.timelocks >> 192) & 0xFFFFFFFF) as u64;
        escrow.deployed_at + src_public_withdrawal
    }
    
    fun get_dst_public_withdrawal_time<T>(escrow: &Escrow<T>): u64 {
        let dst_public_withdrawal = ((escrow.timelocks >> 64) & 0xFFFFFFFF) as u64;
        escrow.deployed_at + dst_public_withdrawal
    }
    
    fun get_src_cancellation_times<T>(escrow: &Escrow<T>): (u64, u64) {
        let src_cancellation = ((escrow.timelocks >> 160) & 0xFFFFFFFF) as u64;
        let src_public_cancellation = ((escrow.timelocks >> 128) & 0xFFFFFFFF) as u64;
        (
            escrow.deployed_at + src_cancellation,
            escrow.deployed_at + src_public_cancellation
        )
    }
    
    fun get_dst_cancellation_time<T>(escrow: &Escrow<T>): u64 {
        let dst_cancellation = ((escrow.timelocks >> 32) & 0xFFFFFFFF) as u64;
        escrow.deployed_at + dst_cancellation
    }
    
    // === View Functions ===
    
    public fun get_escrow_info<T>(escrow: &Escrow<T>): (
        vector<u8>, // order_hash
        address,     // maker
        u64,         // amount
        bool,        // is_source
        u8,          // state
        u64          // total_partial_amount
    ) {
        (
            escrow.order_hash,
            escrow.maker,
            escrow.amount,
            escrow.is_source,
            escrow.state.value,
            escrow.total_partial_amount
        )
    }
    
    public fun get_resolver_count<T>(escrow: &Escrow<T>): u64 {
        vector::length(&escrow.resolvers)
    }
    
    public fun get_resolver_info<T>(escrow: &Escrow<T>, index: u64): (address, u64, u64, bool) {
        let resolver_info = vector::borrow(&escrow.resolvers, index);
        (
            resolver_info.resolver,
            resolver_info.partial_amount,
            resolver_info.safety_deposit,
            escrow.funds_distributed
        )
    }
    
    // === Creation Helper ===
    
    public fun create_immutables(
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        token: address,
        amount: u256,
        safety_deposit: u256,
        timelocks: u256,
    ): Immutables {
        Immutables {
            order_hash,
            hashlock,
            maker,
            taker,
            token,
            amount,
            safety_deposit,
            timelocks,
        }
    }
    
    /// Share an escrow object
    public fun share_escrow<T>(escrow: Escrow<T>) {
        transfer::share_object(escrow);
    }
}