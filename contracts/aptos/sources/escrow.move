module aptos_addr::escrow {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::timestamp;
    use aptos_framework::aptos_account;
    use aptos_std::table::{Self, Table};

    // Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_INVALID_SECRET: u64 = 2;
    const E_INVALID_CALLER: u64 = 3;
    const E_INVALID_TIME: u64 = 4;
    const E_ALREADY_WITHDRAWN: u64 = 5;
    const E_ALREADY_CANCELLED: u64 = 6;
    const E_INVALID_IMMUTABLES: u64 = 7;
    const E_RESOLVER_ALREADY_EXISTS: u64 = 8;
    const E_INSUFFICIENT_FUNDS: u64 = 9;

    // State enum
    const STATE_ACTIVE: u8 = 0;
    const STATE_WITHDRAWN: u8 = 1;
    const STATE_CANCELLED: u8 = 2;

    // Caller reward percentage (10%)
    const CALLER_REWARD_PERCENTAGE: u64 = 10;

    struct Immutables has copy, drop, store {
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        token: address, // For Aptos, this will be type info
        amount: u64,
        safety_deposit: u64,
        timelocks: u64,
    }

    struct ResolverInfo has store {
        partial_amount: u64,
        safety_deposit: u64,
        withdrawn: bool,
    }

    struct Escrow<phantom CoinType> has key {
        // Immutable data
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        amount: u64,
        safety_deposit: u64, // Total safety deposit
        timelocks: u64,
        is_source: bool,
        src_cancellation_timestamp: u64,
        
        // State
        state: u8,
        
        // Partial filling support
        resolvers: vector<address>,
        resolver_info: Table<address, ResolverInfo>,
        total_partial_amount: u64,
        funds_distributed: bool,
        user_funded: bool,
        
        // Funds storage
        coin_store: Coin<CoinType>,
        safety_deposits: Table<address, u64>, // resolver -> safety deposit amount in APT
        
        // Events
        resolver_added_events: EventHandle<ResolverAddedEvent>,
        withdrawn_events: EventHandle<WithdrawnEvent>,
        cancelled_events: EventHandle<CancelledEvent>,
        funds_distributed_events: EventHandle<FundsDistributedEvent>,
    }

    struct ResolverAddedEvent has drop, store {
        resolver: address,
        partial_amount: u64,
        safety_deposit: u64,
    }

    struct WithdrawnEvent has drop, store {
        recipient: address,
        amount: u64,
    }

    struct CancelledEvent has drop, store {
        maker: address,
        amount: u64,
    }

    struct FundsDistributedEvent has drop, store {
        caller: address,
        after_time_limit: bool,
    }

    // Initialize escrow for source chain
    public fun initialize<CoinType>(
        account: &signer,
        immutables: Immutables,
        is_source: bool,
        src_cancellation_timestamp: u64,
    ) {
        let _account_addr = signer::address_of(account);
        
        let escrow = Escrow<CoinType> {
            order_hash: immutables.order_hash,
            hashlock: immutables.hashlock,
            maker: immutables.maker,
            taker: immutables.taker,
            amount: immutables.amount,
            safety_deposit: immutables.safety_deposit,
            timelocks: set_deployed_at(immutables.timelocks, timestamp::now_seconds()),
            is_source,
            src_cancellation_timestamp,
            state: STATE_ACTIVE,
            resolvers: vector::empty(),
            resolver_info: table::new(),
            total_partial_amount: 0,
            funds_distributed: false,
            user_funded: false,
            coin_store: coin::zero<CoinType>(),
            safety_deposits: table::new(),
            resolver_added_events: account::new_event_handle<ResolverAddedEvent>(account),
            withdrawn_events: account::new_event_handle<WithdrawnEvent>(account),
            cancelled_events: account::new_event_handle<CancelledEvent>(account),
            funds_distributed_events: account::new_event_handle<FundsDistributedEvent>(account),
        };
        
        move_to(account, escrow);
    }

    // Add resolver to existing escrow
    public fun add_resolver<CoinType>(
        resolver: address,
        partial_amount: u64,
        safety_deposit_apt: u64,
        escrow_addr: address,
    ) acquires Escrow {
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_addr);
        
        assert!(!table::contains(&escrow.resolver_info, resolver), E_RESOLVER_ALREADY_EXISTS);
        assert!(partial_amount > 0, E_INVALID_IMMUTABLES);
        
        let resolver_info = ResolverInfo {
            partial_amount,
            safety_deposit: safety_deposit_apt,
            withdrawn: false,
        };
        
        table::add(&mut escrow.resolver_info, resolver, resolver_info);
        vector::push_back(&mut escrow.resolvers, resolver);
        table::add(&mut escrow.safety_deposits, resolver, safety_deposit_apt);
        escrow.total_partial_amount = escrow.total_partial_amount + partial_amount;
        
        event::emit_event(&mut escrow.resolver_added_events, ResolverAddedEvent {
            resolver,
            partial_amount,
            safety_deposit: safety_deposit_apt,
        });
    }

    // Deposit coins into escrow
    public fun deposit_coins<CoinType>(
        coins: Coin<CoinType>,
        escrow_addr: address,
    ) acquires Escrow {
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_addr);
        coin::merge(&mut escrow.coin_store, coins);
    }

    // Mark that user has funded the escrow
    public fun mark_user_funded<CoinType>(escrow_addr: address) acquires Escrow {
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_addr);
        escrow.user_funded = true;
    }

    // Withdraw with secret - permissionless
    public fun withdraw_with_secret<CoinType>(
        caller: address,
        secret: vector<u8>,
        immutables: Immutables,
        escrow_addr: address,
    ) acquires Escrow {
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_addr);
        
        // Verify state
        assert!(escrow.state == STATE_ACTIVE, E_INVALID_TIME);
        assert!(!escrow.funds_distributed, E_ALREADY_WITHDRAWN);
        
        // Verify secret
        let computed_hash = aptos_std::aptos_hash::keccak256(secret);
        assert!(computed_hash == escrow.hashlock, E_INVALID_SECRET);
        
        // Verify immutables
        verify_immutables(&immutables, escrow);
        
        // For destination chain, check all resolvers deposited
        if (!escrow.is_source) {
            let current_balance = coin::value(&escrow.coin_store);
            assert!(current_balance >= escrow.total_partial_amount, E_INVALID_TIME);
        };
        
        // Check if caller should get reward
        let current_time = timestamp::now_seconds();
        let deployed_at = get_deployed_at(escrow.timelocks);
        let public_withdrawal_time = if (escrow.is_source) {
            deployed_at + get_src_public_withdrawal(escrow.timelocks)
        } else {
            deployed_at + get_dst_public_withdrawal(escrow.timelocks)
        };
        
        let is_after_time_limit = current_time >= public_withdrawal_time;
        
        // Calculate caller reward
        let caller_reward = 0;
        if (is_after_time_limit && caller != escrow.maker && !is_resolver(escrow, caller)) {
            let total_safety_deposits = calculate_total_safety_deposits(escrow);
            caller_reward = (total_safety_deposits * CALLER_REWARD_PERCENTAGE) / 100;
        };
        
        escrow.funds_distributed = true;
        
        if (escrow.is_source) {
            distribute_source_funds(escrow, caller_reward, caller);
        } else {
            distribute_destination_funds(escrow, caller_reward, caller);
        };
        
        escrow.state = STATE_WITHDRAWN;
        
        event::emit_event(&mut escrow.funds_distributed_events, FundsDistributedEvent {
            caller,
            after_time_limit: is_after_time_limit,
        });
    }

    // Cancel escrow
    public fun cancel<CoinType>(
        caller: address,
        immutables: Immutables,
        escrow_addr: address,
    ) acquires Escrow {
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_addr);
        
        assert!(escrow.state == STATE_ACTIVE, E_INVALID_TIME);
        verify_immutables(&immutables, escrow);
        
        let current_time = timestamp::now_seconds();
        let deployed_at = get_deployed_at(escrow.timelocks);
        
        if (escrow.is_source) {
            let cancellation_time = deployed_at + get_src_cancellation(escrow.timelocks);
            let public_cancellation_time = deployed_at + get_src_public_cancellation(escrow.timelocks);
            
            assert!(current_time >= cancellation_time, E_INVALID_TIME);
            if (current_time < public_cancellation_time) {
                assert!(caller == escrow.maker, E_INVALID_CALLER);
            };
        } else {
            assert!(current_time >= escrow.src_cancellation_timestamp, E_INVALID_TIME);
            let cancellation_time = deployed_at + get_dst_cancellation(escrow.timelocks);
            assert!(current_time >= cancellation_time, E_INVALID_TIME);
        };
        
        escrow.state = STATE_CANCELLED;
        
        // Return coins to maker
        let coin_balance = coin::extract_all(&mut escrow.coin_store);
        if (coin::value(&coin_balance) > 0) {
            aptos_account::deposit_coins(escrow.maker, coin_balance);
        } else {
            coin::destroy_zero(coin_balance);
        };
        
        // Return safety deposits to resolvers would be handled by external calls
        
        event::emit_event(&mut escrow.cancelled_events, CancelledEvent {
            maker: escrow.maker,
            amount: escrow.amount,
        });
    }

    // Helper functions
    fun verify_immutables<CoinType>(immutables: &Immutables, escrow: &Escrow<CoinType>) {
        assert!(immutables.order_hash == escrow.order_hash, E_INVALID_IMMUTABLES);
        assert!(immutables.hashlock == escrow.hashlock, E_INVALID_IMMUTABLES);
        assert!(immutables.maker == escrow.maker, E_INVALID_IMMUTABLES);
        assert!(immutables.taker == escrow.taker, E_INVALID_IMMUTABLES);
        assert!(immutables.amount == escrow.amount, E_INVALID_IMMUTABLES);
        assert!(immutables.safety_deposit == escrow.safety_deposit, E_INVALID_IMMUTABLES);
    }

    fun is_resolver<CoinType>(escrow: &Escrow<CoinType>, addr: address): bool {
        table::contains(&escrow.resolver_info, addr)
    }

    fun calculate_total_safety_deposits<CoinType>(escrow: &Escrow<CoinType>): u64 {
        let total = 0;
        let i = 0;
        let len = vector::length(&escrow.resolvers);
        while (i < len) {
            let resolver = *vector::borrow(&escrow.resolvers, i);
            let safety_deposit = *table::borrow(&escrow.safety_deposits, resolver);
            total = total + safety_deposit;
            i = i + 1;
        };
        total
    }

    fun distribute_source_funds<CoinType>(
        escrow: &mut Escrow<CoinType>,
_caller_reward: u64,
        _caller: address,
    ) {
        // For source: distribute tokens to resolvers proportionally
        let total_coins = coin::extract_all(&mut escrow.coin_store);
        let total_coin_value = coin::value(&total_coins);
        
        let i = 0;
        let len = vector::length(&escrow.resolvers);
        while (i < len) {
            let resolver = *vector::borrow(&escrow.resolvers, i);
            let resolver_info = table::borrow(&escrow.resolver_info, resolver);
            
            // Calculate proportional amount
            let resolver_coins = if (i == len - 1) {
                // Last resolver gets remaining to handle rounding
                coin::extract_all(&mut total_coins)
            } else {
                let resolver_amount = (total_coin_value * resolver_info.partial_amount) / escrow.total_partial_amount;
                coin::extract(&mut total_coins, resolver_amount)
            };
            
            aptos_account::deposit_coins(resolver, resolver_coins);
            
            event::emit_event(&mut escrow.withdrawn_events, WithdrawnEvent {
                recipient: resolver,
                amount: resolver_info.partial_amount,
            });
            
            i = i + 1;
        };
        
        // Destroy any remaining zero coin
        if (coin::value(&total_coins) == 0) {
            coin::destroy_zero(total_coins);
        } else {
            // This shouldn't happen, but safety check
            aptos_account::deposit_coins(escrow.maker, total_coins);
        };
    }

    fun distribute_destination_funds<CoinType>(
        escrow: &mut Escrow<CoinType>,
_caller_reward: u64,
        _caller: address,
    ) {
        // For destination: send all tokens to maker (user)
        let all_coins = coin::extract_all(&mut escrow.coin_store);
        aptos_account::deposit_coins(escrow.maker, all_coins);
        
        event::emit_event(&mut escrow.withdrawn_events, WithdrawnEvent {
            recipient: escrow.maker,
            amount: escrow.total_partial_amount,
        });
    }

    // Timelock utility functions
    fun set_deployed_at(timelocks: u64, timestamp: u64): u64 {
        let mask = 0xFFFFFFFF;
        let offset = 224;
        let shifted_mask = mask << offset;
        let inverted_mask = 0xFFFFFFFFFFFFFFFF - shifted_mask;
        (timelocks & inverted_mask) | (timestamp << offset)
    }

    fun get_deployed_at(timelocks: u64): u64 {
        (timelocks >> 224) & 0xFFFFFFFF
    }

    fun get_src_withdrawal(timelocks: u64): u64 {
        timelocks & 0xFFFFFFFF
    }

    fun get_src_public_withdrawal(timelocks: u64): u64 {
        (timelocks >> 32) & 0xFFFFFFFF
    }

    fun get_src_cancellation(timelocks: u64): u64 {
        (timelocks >> 64) & 0xFFFFFFFF
    }

    fun get_src_public_cancellation(timelocks: u64): u64 {
        (timelocks >> 96) & 0xFFFFFFFF
    }

    fun get_dst_withdrawal(timelocks: u64): u64 {
        (timelocks >> 128) & 0xFFFFFFFF
    }

    fun get_dst_public_withdrawal(timelocks: u64): u64 {
        (timelocks >> 160) & 0xFFFFFFFF
    }

    fun get_dst_cancellation(timelocks: u64): u64 {
        (timelocks >> 192) & 0xFFFFFFFF
    }

    // View functions
    #[view]
    public fun get_escrow_info<CoinType>(escrow_addr: address): (u8, u64, bool, bool) acquires Escrow {
        let escrow = borrow_global<Escrow<CoinType>>(escrow_addr);
        (escrow.state, escrow.total_partial_amount, escrow.funds_distributed, escrow.user_funded)
    }

    #[view]
    public fun get_resolver_info<CoinType>(escrow_addr: address, resolver: address): (u64, u64, bool) acquires Escrow {
        let escrow = borrow_global<Escrow<CoinType>>(escrow_addr);
        if (table::contains(&escrow.resolver_info, resolver)) {
            let info = table::borrow(&escrow.resolver_info, resolver);
            (info.partial_amount, info.safety_deposit, info.withdrawn)
        } else {
            (0, 0, false)
        }
    }

    #[view]
    public fun get_coin_balance<CoinType>(escrow_addr: address): u64 acquires Escrow {
        let escrow = borrow_global<Escrow<CoinType>>(escrow_addr);
        coin::value(&escrow.coin_store)
    }

    #[view]
    public fun get_resolvers<CoinType>(escrow_addr: address): vector<address> acquires Escrow {
        let escrow = borrow_global<Escrow<CoinType>>(escrow_addr);
        escrow.resolvers
    }

    // Function to create Immutables struct
    public fun create_immutables(
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        token: address,
        amount: u64,
        safety_deposit: u64,
        timelocks: u64,
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

    // Getter functions for Immutables fields
    public fun get_order_hash(immutables: &Immutables): vector<u8> {
        immutables.order_hash
    }

    public fun get_amount(immutables: &Immutables): u64 {
        immutables.amount
    }

    public fun get_safety_deposit(immutables: &Immutables): u64 {
        immutables.safety_deposit
    }

    public fun get_maker(immutables: &Immutables): address {
        immutables.maker
    }

    public fun get_taker(immutables: &Immutables): address {
        immutables.taker
    }

    public fun get_hashlock(immutables: &Immutables): vector<u8> {
        immutables.hashlock
    }

    public fun get_token(immutables: &Immutables): address {
        immutables.token
    }

    public fun get_timelocks(immutables: &Immutables): u64 {
        immutables.timelocks
    }
}