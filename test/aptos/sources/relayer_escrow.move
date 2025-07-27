module unite_defi::relayer_escrow {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_framework::event::{Self, EventHandle};
    use aptos_std::table::{Self, Table};
    use std::bcs;
    use aptos_std::hash;

    // Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_AUTHORIZED: u64 = 3;
    const E_ORDER_NOT_FOUND: u64 = 4;
    const E_INVALID_STATE: u64 = 5;
    const E_INSUFFICIENT_SAFETY_DEPOSIT: u64 = 6;
    const E_TIMEOUT_NOT_REACHED: u64 = 7;
    const E_ALREADY_COMMITTED: u64 = 8;
    const E_INSUFFICIENT_ALLOWANCE: u64 = 9;

    // Constants
    const SAFETY_DEPOSIT_AMOUNT: u64 = 1_000_000; // 0.01 APT
    const EXECUTION_TIMEOUT: u64 = 300; // 5 minutes
    
    // Order states
    const STATE_PENDING: u8 = 0;
    const STATE_COMMITTED: u8 = 1;
    const STATE_ESCROWS_DEPLOYED: u8 = 2;
    const STATE_FUNDS_LOCKED: u8 = 3;
    const STATE_COMPLETED: u8 = 4;
    const STATE_RESCUED: u8 = 5;
    const STATE_CANCELLED: u8 = 6;

    // User token allowances for relayer
    struct TokenAllowance<phantom CoinType> has key {
        allowances: Table<address, u64>, // spender -> amount
    }

    // Order information
    struct SwapOrder has store {
        order_id: vector<u8>,
        user: address,
        src_token: address,
        dst_token: address,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        state: u8,
        committed_resolver: address,
        commitment_time: u64,
        secret_hash: vector<u8>,
        src_escrow: address,
        dst_escrow: address,
        created_at: u64,
    }

    // Resolver safety deposit
    struct ResolverDeposit has store {
        resolver: address,
        amount: u64,
        locked_for_order: vector<u8>, // empty if not locked
        deposit_time: u64,
    }

    // Main relayer state
    struct RelayerEscrowFactory has key {
        relayer: address,
        orders: Table<vector<u8>, SwapOrder>,
        resolver_deposits: Table<address, ResolverDeposit>,
        signer_cap: SignerCapability,
        order_counter: u64,
        
        // Events
        order_created_events: EventHandle<OrderCreatedEvent>,
        order_committed_events: EventHandle<OrderCommittedEvent>,
        escrows_deployed_events: EventHandle<EscrowsDeployedEvent>,
        funds_locked_events: EventHandle<FundsLockedEvent>,
        order_completed_events: EventHandle<OrderCompletedEvent>,
        order_rescued_events: EventHandle<OrderRescuedEvent>,
    }

    // Events
    struct OrderCreatedEvent has drop, store {
        order_id: vector<u8>,
        user: address,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
    }

    struct OrderCommittedEvent has drop, store {
        order_id: vector<u8>,
        resolver: address,
        commitment_time: u64,
    }

    struct EscrowsDeployedEvent has drop, store {
        order_id: vector<u8>,
        resolver: address,
        src_escrow: address,
        dst_escrow: address,
    }

    struct FundsLockedEvent has drop, store {
        order_id: vector<u8>,
        user_funds_locked: bool,
        resolver_funds_locked: bool,
    }

    struct OrderCompletedEvent has drop, store {
        order_id: vector<u8>,
        user: address,
        resolver: address,
        secret: vector<u8>,
    }

    struct OrderRescuedEvent has drop, store {
        order_id: vector<u8>,
        original_resolver: address,
        rescue_resolver: address,
        penalty_claimed: u64,
    }

    // Initialize the relayer factory
    public entry fun initialize(deployer: &signer, relayer: address) {
        let deployer_addr = signer::address_of(deployer);
        assert!(!exists<RelayerEscrowFactory>(deployer_addr), E_ALREADY_INITIALIZED);
        
        let (_resource_account, signer_cap) = account::create_resource_account(
            deployer,
            b"relayer_escrow_v1"
        );
        
        let factory = RelayerEscrowFactory {
            relayer,
            orders: table::new(),
            resolver_deposits: table::new(),
            signer_cap,
            order_counter: 0,
            order_created_events: account::new_event_handle<OrderCreatedEvent>(deployer),
            order_committed_events: account::new_event_handle<OrderCommittedEvent>(deployer),
            escrows_deployed_events: account::new_event_handle<EscrowsDeployedEvent>(deployer),
            funds_locked_events: account::new_event_handle<FundsLockedEvent>(deployer),
            order_completed_events: account::new_event_handle<OrderCompletedEvent>(deployer),
            order_rescued_events: account::new_event_handle<OrderRescuedEvent>(deployer),
        };
        
        move_to(deployer, factory);
    }

    // User approves tokens to relayer
    public entry fun approve_tokens<CoinType>(
        user: &signer,
        amount: u64,
    ) acquires TokenAllowance {
        let user_addr = signer::address_of(user);
        
        if (!exists<TokenAllowance<CoinType>>(user_addr)) {
            let allowance = TokenAllowance<CoinType> {
                allowances: table::new(),
            };
            move_to(user, allowance);
        };
        
        let allowance = borrow_global_mut<TokenAllowance<CoinType>>(user_addr);
        
        if (!table::contains(&allowance.allowances, @unite_defi)) {
            table::add(&mut allowance.allowances, @unite_defi, amount);
        } else {
            let approved_amount = table::borrow_mut(&mut allowance.allowances, @unite_defi);
            *approved_amount = amount;
        };
    }

    // Resolver deposits safety funds
    public entry fun deposit_safety_funds(
        resolver: &signer,
        amount: u64,
    ) acquires RelayerEscrowFactory {
        let resolver_addr = signer::address_of(resolver);
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        assert!(amount >= SAFETY_DEPOSIT_AMOUNT, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        // Withdraw APT from resolver
        let deposit = coin::withdraw<AptosCoin>(resolver, amount);
        
        let factory = borrow_global_mut<RelayerEscrowFactory>(@unite_defi);
        
        // Store in factory's resource account
        let resource_signer = account::create_signer_with_capability(&factory.signer_cap);
        coin::deposit(signer::address_of(&resource_signer), deposit);
        
        // Record deposit
        let resolver_deposit = ResolverDeposit {
            resolver: resolver_addr,
            amount,
            locked_for_order: vector::empty(),
            deposit_time: timestamp::now_seconds(),
        };
        
        if (table::contains(&factory.resolver_deposits, resolver_addr)) {
            let existing = table::borrow_mut(&mut factory.resolver_deposits, resolver_addr);
            existing.amount = existing.amount + amount;
        } else {
            table::add(&mut factory.resolver_deposits, resolver_addr, resolver_deposit);
        };
    }

    // Relayer creates order for user
    public entry fun create_order<CoinType>(
        relayer: &signer,
        user: address,
        src_token: address,
        dst_token: address,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
    ) acquires RelayerEscrowFactory {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<RelayerEscrowFactory>(@unite_defi);
        assert!(relayer_addr == factory.relayer, E_NOT_AUTHORIZED);
        
        // Generate order ID
        let order_id_data = vector::empty<u8>();
        vector::append(&mut order_id_data, bcs::to_bytes(&user));
        vector::append(&mut order_id_data, bcs::to_bytes(&src_amount));
        vector::append(&mut order_id_data, bcs::to_bytes(&dst_amount));
        vector::append(&mut order_id_data, bcs::to_bytes(&timestamp::now_seconds()));
        vector::append(&mut order_id_data, bcs::to_bytes(&factory.order_counter));
        let order_id = hash::sha3_256(order_id_data);
        
        factory.order_counter = factory.order_counter + 1;
        
        let order = SwapOrder {
            order_id: order_id,
            user,
            src_token,
            dst_token,
            src_amount,
            dst_amount,
            src_chain_id,
            dst_chain_id,
            state: STATE_PENDING,
            committed_resolver: @0x0,
            commitment_time: 0,
            secret_hash: vector::empty(),
            src_escrow: @0x0,
            dst_escrow: @0x0,
            created_at: timestamp::now_seconds(),
        };
        
        table::add(&mut factory.orders, order_id, order);
        
        // Emit event
        event::emit_event(&mut factory.order_created_events, OrderCreatedEvent {
            order_id,
            user,
            src_amount,
            dst_amount,
            src_chain_id,
            dst_chain_id,
        });
    }

    // Resolver commits to fulfill order
    public entry fun commit_to_order(
        resolver: &signer,
        order_id: vector<u8>,
    ) acquires RelayerEscrowFactory {
        let resolver_addr = signer::address_of(resolver);
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<RelayerEscrowFactory>(@unite_defi);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        assert!(table::contains(&factory.resolver_deposits, resolver_addr), E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        let order = table::borrow_mut(&mut factory.orders, order_id);
        assert!(order.state == STATE_PENDING, E_INVALID_STATE);
        
        let resolver_deposit = table::borrow_mut(&mut factory.resolver_deposits, resolver_addr);
        assert!(vector::is_empty(&resolver_deposit.locked_for_order), E_ALREADY_COMMITTED);
        assert!(resolver_deposit.amount >= SAFETY_DEPOSIT_AMOUNT, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        // Lock resolver deposit for this order
        resolver_deposit.locked_for_order = order_id;
        
        // Update order
        order.state = STATE_COMMITTED;
        order.committed_resolver = resolver_addr;
        order.commitment_time = timestamp::now_seconds();
        
        // Emit event
        event::emit_event(&mut factory.order_committed_events, OrderCommittedEvent {
            order_id,
            resolver: resolver_addr,
            commitment_time: order.commitment_time,
        });
    }

    // Resolver notifies escrows are deployed
    public entry fun notify_escrows_deployed(
        resolver: &signer,
        order_id: vector<u8>,
        secret_hash: vector<u8>,
        src_escrow: address,
        dst_escrow: address,
    ) acquires RelayerEscrowFactory {
        let resolver_addr = signer::address_of(resolver);
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<RelayerEscrowFactory>(@unite_defi);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        
        let order = table::borrow_mut(&mut factory.orders, order_id);
        assert!(order.state == STATE_COMMITTED, E_INVALID_STATE);
        assert!(order.committed_resolver == resolver_addr, E_NOT_AUTHORIZED);
        
        // Update order
        order.state = STATE_ESCROWS_DEPLOYED;
        order.secret_hash = secret_hash;
        order.src_escrow = src_escrow;
        order.dst_escrow = dst_escrow;
        
        // Emit event
        event::emit_event(&mut factory.escrows_deployed_events, EscrowsDeployedEvent {
            order_id,
            resolver: resolver_addr,
            src_escrow,
            dst_escrow,
        });
    }

    // Relayer locks user funds in source escrow
    public entry fun lock_user_funds<CoinType>(
        relayer: &signer,
        order_id: vector<u8>,
    ) acquires RelayerEscrowFactory, TokenAllowance {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<RelayerEscrowFactory>(@unite_defi);
        assert!(relayer_addr == factory.relayer, E_NOT_AUTHORIZED);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        
        let order = table::borrow_mut(&mut factory.orders, order_id);
        assert!(order.state == STATE_ESCROWS_DEPLOYED, E_INVALID_STATE);
        
        // Withdraw from user's allowance
        let tokens = withdraw_from_allowance<CoinType>(order.user, order.src_amount);
        
        // Deposit to source escrow (in real implementation, this would be cross-chain call)
        // For simulation, we'll hold in factory
        let resource_signer = account::create_signer_with_capability(&factory.signer_cap);
        coin::deposit(signer::address_of(&resource_signer), tokens);
        
        order.state = STATE_FUNDS_LOCKED;
        
        // Emit event
        event::emit_event(&mut factory.funds_locked_events, FundsLockedEvent {
            order_id,
            user_funds_locked: true,
            resolver_funds_locked: true, // Assume resolver also locked funds
        });
    }

    // Relayer completes order by revealing secret
    public entry fun complete_order(
        relayer: &signer,
        order_id: vector<u8>,
        secret: vector<u8>,
    ) acquires RelayerEscrowFactory {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<RelayerEscrowFactory>(@unite_defi);
        assert!(relayer_addr == factory.relayer, E_NOT_AUTHORIZED);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        
        let order = table::borrow_mut(&mut factory.orders, order_id);
        assert!(order.state == STATE_FUNDS_LOCKED, E_INVALID_STATE);
        
        // Verify secret matches hash
        let computed_hash = hash::sha3_256(secret);
        assert!(computed_hash == order.secret_hash, E_NOT_AUTHORIZED);
        
        // Release resolver's safety deposit
        let resolver_deposit = table::borrow_mut(&mut factory.resolver_deposits, order.committed_resolver);
        resolver_deposit.locked_for_order = vector::empty();
        
        order.state = STATE_COMPLETED;
        
        // Emit event
        event::emit_event(&mut factory.order_completed_events, OrderCompletedEvent {
            order_id,
            user: order.user,
            resolver: order.committed_resolver,
            secret,
        });
    }

    // Any resolver can rescue timed-out order
    public entry fun rescue_order(
        rescue_resolver: &signer,
        order_id: vector<u8>,
        secret: vector<u8>,
    ) acquires RelayerEscrowFactory {
        let rescue_resolver_addr = signer::address_of(rescue_resolver);
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<RelayerEscrowFactory>(@unite_defi);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        assert!(table::contains(&factory.resolver_deposits, rescue_resolver_addr), E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        let order = table::borrow_mut(&mut factory.orders, order_id);
        assert!(order.state == STATE_FUNDS_LOCKED, E_INVALID_STATE);
        
        let current_time = timestamp::now_seconds();
        assert!(current_time >= order.commitment_time + EXECUTION_TIMEOUT, E_TIMEOUT_NOT_REACHED);
        
        // Verify secret matches hash
        let computed_hash = hash::sha3_256(secret);
        assert!(computed_hash == order.secret_hash, E_NOT_AUTHORIZED);
        
        let original_resolver = order.committed_resolver;
        
        // Transfer penalty from original resolver to rescue resolver
        let original_deposit = table::borrow_mut(&mut factory.resolver_deposits, original_resolver);
        let penalty_amount = SAFETY_DEPOSIT_AMOUNT;
        original_deposit.amount = original_deposit.amount - penalty_amount;
        original_deposit.locked_for_order = vector::empty();
        
        let rescue_deposit = table::borrow_mut(&mut factory.resolver_deposits, rescue_resolver_addr);
        rescue_deposit.amount = rescue_deposit.amount + penalty_amount;
        
        order.state = STATE_RESCUED;
        order.committed_resolver = rescue_resolver_addr;
        
        // Emit event
        event::emit_event(&mut factory.order_rescued_events, OrderRescuedEvent {
            order_id,
            original_resolver,
            rescue_resolver: rescue_resolver_addr,
            penalty_claimed: penalty_amount,
        });
    }

    // Helper function to withdraw from user allowance
    fun withdraw_from_allowance<CoinType>(
        owner: address,
        amount: u64,
    ): Coin<CoinType> acquires TokenAllowance, RelayerEscrowFactory {
        assert!(exists<TokenAllowance<CoinType>>(owner), E_INSUFFICIENT_ALLOWANCE);
        
        let allowance = borrow_global_mut<TokenAllowance<CoinType>>(owner);
        assert!(table::contains(&allowance.allowances, @unite_defi), E_INSUFFICIENT_ALLOWANCE);
        
        let approved_amount = table::borrow_mut(&mut allowance.allowances, @unite_defi);
        assert!(*approved_amount >= amount, E_INSUFFICIENT_ALLOWANCE);
        
        *approved_amount = *approved_amount - amount;
        
        coin::withdraw<CoinType>(&account::create_signer_with_capability(&borrow_global<RelayerEscrowFactory>(@unite_defi).signer_cap), amount)
    }

    // View functions
    #[view]
    public fun get_order(order_id: vector<u8>): (u8, address, address, u64, u64, u64) acquires RelayerEscrowFactory {
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        let factory = borrow_global<RelayerEscrowFactory>(@unite_defi);
        
        if (table::contains(&factory.orders, order_id)) {
            let order = table::borrow(&factory.orders, order_id);
            (order.state, order.user, order.committed_resolver, order.src_amount, order.dst_amount, order.commitment_time)
        } else {
            (0, @0x0, @0x0, 0, 0, 0)
        }
    }

    #[view]
    public fun get_resolver_deposit(resolver: address): (u64, bool, u64) acquires RelayerEscrowFactory {
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        let factory = borrow_global<RelayerEscrowFactory>(@unite_defi);
        
        if (table::contains(&factory.resolver_deposits, resolver)) {
            let deposit = table::borrow(&factory.resolver_deposits, resolver);
            (deposit.amount, !vector::is_empty(&deposit.locked_for_order), deposit.deposit_time)
        } else {
            (0, false, 0)
        }
    }

    #[view]
    public fun is_order_expired(order_id: vector<u8>): bool acquires RelayerEscrowFactory {
        assert!(exists<RelayerEscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        let factory = borrow_global<RelayerEscrowFactory>(@unite_defi);
        
        if (table::contains(&factory.orders, order_id)) {
            let order = table::borrow(&factory.orders, order_id);
            let current_time = timestamp::now_seconds();
            order.state == STATE_FUNDS_LOCKED && current_time >= order.commitment_time + EXECUTION_TIMEOUT
        } else {
            false
        }
    }
}