module unite::escrow {
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

    // === Constants ===
    const CALLER_REWARD_PERCENTAGE: u64 = 10; // 10% reward for calling after time limit

    // === Structs ===
    
    /// Core escrow state
    public struct EscrowState has key, store {
        id: UID,
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        token_type: vector<u8>, // Type name as bytes
        amount: u64,
        safety_deposit_per_unit: u64,
        timelocks: Timelocks,
        is_source: bool,
        src_cancellation_timestamp: Option<u64>,
        is_active: bool,
        is_withdrawn: bool,
        is_cancelled: bool,
        funds_distributed: bool,
        total_partial_amount: u64,
        total_partial_withdrawn: u64,
        user_funded: bool,
    }

    /// Timelock configuration
    public struct Timelocks has store, copy, drop {
        deployed_at: u64,
        src_withdrawal: u32,
        src_public_withdrawal: u32,
        src_cancellation: u32,
        src_public_cancellation: u32,
        dst_withdrawal: u32,
        dst_public_withdrawal: u32,
        dst_cancellation: u32,
    }

    /// Resolver participation info
    public struct ResolverInfo has store, copy, drop {
        resolver: address,
        partial_amount: u64,
        safety_deposit: u64,
        withdrawn: bool,
    }

    /// Escrow for SUI tokens
    public struct SuiEscrow has key, store {
        id: UID,
        state: EscrowState,
        token_balance: Balance<SUI>,
        safety_deposits: Balance<SUI>,
        resolvers: vector<ResolverInfo>,
    }

    /// Generic escrow for any coin type
    public struct CoinEscrow<phantom T> has key, store {
        id: UID,
        state: EscrowState,
        token_balance: Balance<T>,
        safety_deposits: Balance<SUI>,
        resolvers: vector<ResolverInfo>,
    }

    /// Capability to manage escrow
    public struct EscrowCap has key, store {
        id: UID,
        escrow_id: ID,
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

    // === Public Functions ===

    /// Create SUI escrow for source chain
    public fun create_sui_escrow_src(
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        amount: u64,
        safety_deposit_per_unit: u64,
        timelocks: Timelocks,
        resolver: address,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ): (SuiEscrow, EscrowCap) {
        let current_time = clock::timestamp_ms(clock) / 1000;
        
        let mut state = EscrowState {
            id: object::new(ctx),
            order_hash,
            hashlock,
            maker,
            taker,
            token_type: b"0x2::sui::SUI",
            amount,
            safety_deposit_per_unit,
            timelocks: Timelocks {
                deployed_at: current_time,
                src_withdrawal: timelocks.src_withdrawal,
                src_public_withdrawal: timelocks.src_public_withdrawal,
                src_cancellation: timelocks.src_cancellation,
                src_public_cancellation: timelocks.src_public_cancellation,
                dst_withdrawal: timelocks.dst_withdrawal,
                dst_public_withdrawal: timelocks.dst_public_withdrawal,
                dst_cancellation: timelocks.dst_cancellation,
            },
            is_source: true,
            src_cancellation_timestamp: option::none(),
            is_active: true,
            is_withdrawn: false,
            is_cancelled: false,
            funds_distributed: false,
            total_partial_amount: partial_amount,
            total_partial_withdrawn: 0,
            user_funded: false,
        };

        let escrow_id = object::id(&state);
        
        let resolver_info = ResolverInfo {
            resolver,
            partial_amount,
            safety_deposit: coin::value(&safety_deposit),
            withdrawn: false,
        };

        let escrow = SuiEscrow {
            id: object::new(ctx),
            state,
            token_balance: balance::zero(),
            safety_deposits: coin::into_balance(safety_deposit),
            resolvers: vector[resolver_info],
        };

        let cap = EscrowCap {
            id: object::new(ctx),
            escrow_id,
        };

        event::emit(EscrowCreated {
            escrow_id,
            order_hash: escrow.state.order_hash,
            is_source: true,
            maker,
            amount,
        });

        event::emit(ResolverAdded {
            escrow_id,
            resolver,
            partial_amount,
            safety_deposit: resolver_info.safety_deposit,
        });

        (escrow, cap)
    }

    /// Create SUI escrow for destination chain
    public fun create_sui_escrow_dst(
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        amount: u64,
        safety_deposit_per_unit: u64,
        timelocks: Timelocks,
        src_cancellation_timestamp: u64,
        resolver: address,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ): (SuiEscrow, EscrowCap) {
        let current_time = clock::timestamp_ms(clock) / 1000;
        
        let mut state = EscrowState {
            id: object::new(ctx),
            order_hash,
            hashlock,
            maker,
            taker,
            token_type: b"0x2::sui::SUI",
            amount,
            safety_deposit_per_unit,
            timelocks: Timelocks {
                deployed_at: current_time,
                src_withdrawal: timelocks.src_withdrawal,
                src_public_withdrawal: timelocks.src_public_withdrawal,
                src_cancellation: timelocks.src_cancellation,
                src_public_cancellation: timelocks.src_public_cancellation,
                dst_withdrawal: timelocks.dst_withdrawal,
                dst_public_withdrawal: timelocks.dst_public_withdrawal,
                dst_cancellation: timelocks.dst_cancellation,
            },
            is_source: false,
            src_cancellation_timestamp: option::some(src_cancellation_timestamp),
            is_active: true,
            is_withdrawn: false,
            is_cancelled: false,
            funds_distributed: false,
            total_partial_amount: partial_amount,
            total_partial_withdrawn: 0,
            user_funded: false,
        };

        let escrow_id = object::id(&state);
        
        let resolver_info = ResolverInfo {
            resolver,
            partial_amount,
            safety_deposit: coin::value(&safety_deposit),
            withdrawn: false,
        };

        let escrow = SuiEscrow {
            id: object::new(ctx),
            state,
            token_balance: balance::zero(),
            safety_deposits: coin::into_balance(safety_deposit),
            resolvers: vector[resolver_info],
        };

        let cap = EscrowCap {
            id: object::new(ctx),
            escrow_id,
        };

        event::emit(EscrowCreated {
            escrow_id,
            order_hash: escrow.state.order_hash,
            is_source: false,
            maker,
            amount,
        });

        event::emit(ResolverAdded {
            escrow_id,
            resolver,
            partial_amount,
            safety_deposit: resolver_info.safety_deposit,
        });

        (escrow, cap)
    }

    /// Add additional resolver to existing SUI escrow
    public fun add_resolver_to_sui_escrow(
        escrow: &mut SuiEscrow,
        resolver: address,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        _ctx: &mut TxContext
    ) {
        assert!(escrow.state.is_active, ENotInitialized);
        
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
        escrow.state.total_partial_amount = escrow.state.total_partial_amount + partial_amount;

        event::emit(ResolverAdded {
            escrow_id: object::id(&escrow.state),
            resolver,
            partial_amount,
            safety_deposit: resolver_info.safety_deposit,
        });
    }

    /// Deposit tokens into escrow (for destination escrows)
    public fun deposit_sui_tokens(
        escrow: &mut SuiEscrow,
        tokens: Coin<SUI>,
        _ctx: &mut TxContext
    ) {
        balance::join(&mut escrow.token_balance, coin::into_balance(tokens));
    }

    /// Mark user funds as transferred (for source escrows)
    public fun mark_user_funded(escrow: &mut SuiEscrow) {
        escrow.state.user_funded = true;
    }

    /// Withdraw with secret (permissionless)
    public fun withdraw_sui_with_secret(
        escrow: &mut SuiEscrow,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(escrow.state.is_active, EInvalidTime);
        assert!(!escrow.state.funds_distributed, EAlreadyWithdrawn);
        
        // Verify secret
        let hash = hash::sha2_256(secret);
        assert!(hash == escrow.state.hashlock, EInvalidSecret);
        
        // For destination chain, check that all resolvers have deposited their tokens
        if (!escrow.state.is_source) {
            let current_balance = balance::value(&escrow.token_balance);
            assert!(current_balance >= escrow.state.total_partial_amount, EInsufficientFunds);
        };
        
        let current_time = clock::timestamp_ms(clock) / 1000;
        let caller = tx_context::sender(ctx);
        
        // Check if caller should get reward
        let is_after_time_limit = if (escrow.state.is_source) {
            let public_withdrawal_time = escrow.state.timelocks.deployed_at + (escrow.state.timelocks.src_public_withdrawal as u64);
            current_time >= public_withdrawal_time
        } else {
            let public_withdrawal_time = escrow.state.timelocks.deployed_at + (escrow.state.timelocks.dst_public_withdrawal as u64);
            current_time >= public_withdrawal_time
        };
        
        escrow.state.funds_distributed = true;
        
        // Calculate caller reward if applicable
        let caller_reward = if (is_after_time_limit && caller != escrow.state.maker) {
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
        };
        
        if (escrow.state.is_source) {
            distribute_source_sui_funds(escrow, caller_reward, ctx);
        } else {
            distribute_destination_sui_funds(escrow, caller_reward, ctx);
        };
        
        // Send caller reward if applicable
        if (caller_reward > 0) {
            let reward_balance = balance::split(&mut escrow.safety_deposits, caller_reward);
            let reward_coin = coin::from_balance(reward_balance, ctx);
            transfer::public_transfer(reward_coin, caller);
            
            event::emit(CallerRewarded {
                escrow_id: object::id(&escrow.state),
                caller,
                reward: caller_reward,
            });
        };
        
        escrow.state.is_withdrawn = true;
        
        event::emit(FundsDistributed {
            escrow_id: object::id(&escrow.state),
            caller,
            after_time_limit: is_after_time_limit,
        });
    }

    /// Cancel escrow
    public fun cancel_sui_escrow(
        escrow: &mut SuiEscrow,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(escrow.state.is_active, EInvalidTime);
        
        let current_time = clock::timestamp_ms(clock) / 1000;
        let caller = tx_context::sender(ctx);
        
        if (escrow.state.is_source) {
            // Source chain cancellation
            let cancellation_time = escrow.state.timelocks.deployed_at + (escrow.state.timelocks.src_cancellation as u64);
            let public_cancellation_time = escrow.state.timelocks.deployed_at + (escrow.state.timelocks.src_public_cancellation as u64);
            
            assert!(current_time >= cancellation_time, EInvalidTime);
            if (current_time < public_cancellation_time) {
                assert!(caller == escrow.state.maker, EInvalidCaller);
            };
        } else {
            // Destination chain cancellation
            let src_cancellation = option::borrow(&escrow.state.src_cancellation_timestamp);
            assert!(current_time >= *src_cancellation, EInvalidTime);
            
            let cancellation_time = escrow.state.timelocks.deployed_at + (escrow.state.timelocks.dst_cancellation as u64);
            assert!(current_time >= cancellation_time, EInvalidTime);
        };
        
        escrow.state.is_cancelled = true;
        escrow.state.is_active = false;
        
        // Return tokens to maker
        let token_balance_value = balance::value(&escrow.token_balance);
        if (token_balance_value > 0) {
            let returned_balance = balance::split(&mut escrow.token_balance, token_balance_value);
            let returned_coin = coin::from_balance(returned_balance, ctx);
            transfer::public_transfer(returned_coin, escrow.state.maker);
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
            escrow_id: object::id(&escrow.state),
            maker: escrow.state.maker,
            amount: escrow.state.amount,
        });
    }

    // === Helper Functions ===
    
    fun distribute_source_sui_funds(
        escrow: &mut SuiEscrow,
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
                escrow_id: object::id(&escrow.state),
                recipient: resolver_info.resolver,
                amount: resolver_info.partial_amount,
            });
            
            i = i + 1;
        };
    }
    
    fun distribute_destination_sui_funds(
        escrow: &mut SuiEscrow,
        caller_reward: u64,
        ctx: &mut TxContext
    ) {
        // Send all tokens to user (maker)
        let total_tokens = balance::value(&escrow.token_balance);
        if (total_tokens > 0) {
            let user_balance = balance::split(&mut escrow.token_balance, total_tokens);
            let user_coin = coin::from_balance(user_balance, ctx);
            transfer::public_transfer(user_coin, escrow.state.maker);
            
            event::emit(Withdrawn {
                escrow_id: object::id(&escrow.state),
                recipient: escrow.state.maker,
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

    // === Helper Functions for Creation ===
    
    public fun create_timelocks(
        deployed_at: u64,
        src_withdrawal: u32,
        src_public_withdrawal: u32,
        src_cancellation: u32,
        src_public_cancellation: u32,
        dst_withdrawal: u32,
        dst_public_withdrawal: u32,
        dst_cancellation: u32,
    ): Timelocks {
        Timelocks {
            deployed_at,
            src_withdrawal,
            src_public_withdrawal,
            src_cancellation,
            src_public_cancellation,
            dst_withdrawal,
            dst_public_withdrawal,
            dst_cancellation,
        }
    }

    // === View Functions ===
    
    public fun get_escrow_info(escrow: &SuiEscrow): (
        vector<u8>, // order_hash
        vector<u8>, // hashlock
        address,    // maker
        address,    // taker
        u64,        // amount
        bool,       // is_source
        bool,       // is_active
        bool,       // is_withdrawn
        u64         // total_partial_amount
    ) {
        (
            escrow.state.order_hash,
            escrow.state.hashlock,
            escrow.state.maker,
            escrow.state.taker,
            escrow.state.amount,
            escrow.state.is_source,
            escrow.state.is_active,
            escrow.state.is_withdrawn,
            escrow.state.total_partial_amount
        )
    }
    
    public fun get_resolver_count(escrow: &SuiEscrow): u64 {
        vector::length(&escrow.resolvers)
    }
    
    public fun get_resolver_info(escrow: &SuiEscrow, index: u64): (address, u64, u64, bool) {
        let resolver_info = vector::borrow(&escrow.resolvers, index);
        (
            resolver_info.resolver,
            resolver_info.partial_amount,
            resolver_info.safety_deposit,
            resolver_info.withdrawn
        )
    }
    
    public fun get_token_balance(escrow: &SuiEscrow): u64 {
        balance::value(&escrow.token_balance)
    }
    
    public fun get_safety_deposits_balance(escrow: &SuiEscrow): u64 {
        balance::value(&escrow.safety_deposits)
    }
}