module relayer_escrow_addr::relayer_escrow_v2 {
    use std::signer;
    use std::vector;
    use std::hash;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    use aptos_framework::account;

    /// Order states
    const ORDER_CREATED: u8 = 0;
    const ORDER_COMMITTED: u8 = 1;
    const ORDER_ESCROWS_DEPLOYED: u8 = 2;
    const ORDER_FUNDS_LOCKED: u8 = 3;
    const ORDER_COMPLETED: u8 = 4;
    const ORDER_RESCUED: u8 = 5;

    /// Constants
    const EXECUTION_TIMEOUT: u64 = 300; // 5 minutes in seconds
    const SAFETY_DEPOSIT: u64 = 10000000; // 0.01 APT in octas

    /// Error codes
    const E_ORDER_EXISTS: u64 = 1;
    const E_ORDER_NOT_FOUND: u64 = 2;
    const E_INVALID_STATE: u64 = 3;
    const E_UNAUTHORIZED: u64 = 4;
    const E_INSUFFICIENT_DEPOSIT: u64 = 5;
    const E_INVALID_SECRET: u64 = 6;
    const E_NOT_TIMED_OUT: u64 = 7;

    /// Swap Order structure
    struct SwapOrder has store, drop {
        order_id: vector<u8>,
        user: address,
        src_token: vector<u8>,
        dst_token: vector<u8>,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        secret_hash: vector<u8>,
        committed_resolver: address,
        commitment_time: u64,
        deadline: u64,
        state: u8,
    }

    /// Global state
    struct RelayerState has key {
        relayer: address,
        orders: vector<SwapOrder>,
        resolver_deposits: vector<ResolverDeposit>,
        authorized_resolvers: vector<address>,
    }

    struct ResolverDeposit has store, drop {
        resolver: address,
        amount: u64,
    }

    /// Events
    struct OrderCreatedEvent has drop, store {
        order_id: vector<u8>,
        user: address,
        src_amount: u64,
        dst_amount: u64,
    }

    struct OrderCommittedEvent has drop, store {
        order_id: vector<u8>,
        resolver: address,
        deadline: u64,
    }

    struct EscrowsDeployedEvent has drop, store {
        order_id: vector<u8>,
        src_escrow: address,
        dst_escrow: address,
    }

    struct FundsLockedEvent has drop, store {
        order_id: vector<u8>,
        amount: u64,
    }

    struct OrderCompletedEvent has drop, store {
        order_id: vector<u8>,
        secret: vector<u8>,
    }

    struct OrderRescuedEvent has drop, store {
        order_id: vector<u8>,
        original_resolver: address,
        rescue_resolver: address,
    }

    /// Initialize the relayer escrow system
    public entry fun initialize(relayer: &signer) {
        let relayer_addr = signer::address_of(relayer);
        
        move_to(relayer, RelayerState {
            relayer: relayer_addr,
            orders: vector::empty(),
            resolver_deposits: vector::empty(),
            authorized_resolvers: vector::empty(),
        });
    }

    /// Step 2: Create order after user submission
    public entry fun create_order(
        relayer: &signer,
        order_id: vector<u8>,
        user: address,
        src_token: vector<u8>,
        dst_token: vector<u8>,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        secret_hash: vector<u8>
    ) acquires RelayerState {
        let relayer_addr = signer::address_of(relayer);
        let state = borrow_global_mut<RelayerState>(relayer_addr);
        
        assert!(signer::address_of(relayer) == state.relayer, E_UNAUTHORIZED);
        assert!(!order_exists(&state.orders, &order_id), E_ORDER_EXISTS);

        let order = SwapOrder {
            order_id: order_id,
            user,
            src_token,
            dst_token,
            src_amount,
            dst_amount,
            src_chain_id,
            dst_chain_id,
            secret_hash,
            committed_resolver: @0x0,
            commitment_time: 0,
            deadline: 0,
            state: ORDER_CREATED,
        };

        vector::push_back(&mut state.orders, order);

        event::emit(OrderCreatedEvent {
            order_id,
            user,
            src_amount,
            dst_amount,
        });
    }

    /// Step 4: Resolver commits to order
    public entry fun commit_to_order<CoinType>(
        resolver: &signer,
        relayer_addr: address,
        order_id: vector<u8>
    ) acquires RelayerState {
        let resolver_addr = signer::address_of(resolver);
        let state = borrow_global_mut<RelayerState>(relayer_addr);
        
        assert!(is_authorized_resolver(state, resolver_addr), E_UNAUTHORIZED);
        
        let order_index = find_order_index(&state.orders, &order_id);
        let order = vector::borrow_mut(&mut state.orders, order_index);
        
        assert!(order.state == ORDER_CREATED, E_INVALID_STATE);

        // Transfer safety deposit
        let deposit = coin::withdraw<CoinType>(resolver, SAFETY_DEPOSIT);
        coin::deposit(relayer_addr, deposit);

        // Update order
        order.committed_resolver = resolver_addr;
        order.commitment_time = timestamp::now_seconds();
        order.deadline = timestamp::now_seconds() + EXECUTION_TIMEOUT;
        order.state = ORDER_COMMITTED;

        // Record deposit
        add_resolver_deposit(state, resolver_addr, SAFETY_DEPOSIT);

        event::emit(OrderCommittedEvent {
            order_id,
            resolver: resolver_addr,
            deadline: order.deadline,
        });
    }

    /// Step 6: Notify escrows deployed
    public entry fun notify_escrows_deployed(
        resolver: &signer,
        relayer_addr: address,
        order_id: vector<u8>,
        src_escrow: address,
        dst_escrow: address
    ) acquires RelayerState {
        let resolver_addr = signer::address_of(resolver);
        let state = borrow_global_mut<RelayerState>(relayer_addr);
        
        let order_index = find_order_index(&state.orders, &order_id);
        let order = vector::borrow_mut(&mut state.orders, order_index);
        
        assert!(order.committed_resolver == resolver_addr, E_UNAUTHORIZED);
        assert!(order.state == ORDER_COMMITTED, E_INVALID_STATE);

        order.state = ORDER_ESCROWS_DEPLOYED;

        event::emit(EscrowsDeployedEvent {
            order_id,
            src_escrow,
            dst_escrow,
        });
    }

    /// Step 7: Lock user funds (simplified - in real implementation would transfer from user)
    public entry fun lock_user_funds<CoinType>(
        relayer: &signer,
        order_id: vector<u8>,
        amount: u64
    ) acquires RelayerState {
        let relayer_addr = signer::address_of(relayer);
        let state = borrow_global_mut<RelayerState>(relayer_addr);
        
        assert!(signer::address_of(relayer) == state.relayer, E_UNAUTHORIZED);
        
        let order_index = find_order_index(&state.orders, &order_id);
        let order = vector::borrow_mut(&mut state.orders, order_index);
        
        assert!(order.state == ORDER_ESCROWS_DEPLOYED, E_INVALID_STATE);

        order.state = ORDER_FUNDS_LOCKED;

        event::emit(FundsLockedEvent {
            order_id,
            amount,
        });
    }

    /// Step 10: Complete order by revealing secret
    public entry fun complete_order<CoinType>(
        relayer: &signer,
        order_id: vector<u8>,
        secret: vector<u8>
    ) acquires RelayerState {
        let relayer_addr = signer::address_of(relayer);
        let state = borrow_global_mut<RelayerState>(relayer_addr);
        
        assert!(signer::address_of(relayer) == state.relayer, E_UNAUTHORIZED);
        
        let order_index = find_order_index(&state.orders, &order_id);
        let order = vector::borrow_mut(&mut state.orders, order_index);
        
        assert!(order.state == ORDER_FUNDS_LOCKED, E_INVALID_STATE);
        assert!(hash::sha3_256(secret) == order.secret_hash, E_INVALID_SECRET);

        // Return safety deposit to resolver
        let deposit_amount = get_resolver_deposit(state, order.committed_resolver);
        remove_resolver_deposit(state, order.committed_resolver);
        
        let deposit = coin::withdraw<CoinType>(relayer, deposit_amount);
        coin::deposit(order.committed_resolver, deposit);

        order.state = ORDER_COMPLETED;

        event::emit(OrderCompletedEvent {
            order_id,
            secret,
        });
    }

    /// Alternative: Rescue timed-out order
    public entry fun rescue_order<CoinType>(
        rescuer: &signer,
        relayer_addr: address,
        order_id: vector<u8>,
        secret: vector<u8>
    ) acquires RelayerState {
        let rescuer_addr = signer::address_of(rescuer);
        let state = borrow_global_mut<RelayerState>(relayer_addr);
        
        assert!(is_authorized_resolver(state, rescuer_addr), E_UNAUTHORIZED);
        
        let order_index = find_order_index(&state.orders, &order_id);
        let order = vector::borrow_mut(&mut state.orders, order_index);
        
        assert!(order.state == ORDER_FUNDS_LOCKED, E_INVALID_STATE);
        assert!(timestamp::now_seconds() > order.deadline, E_NOT_TIMED_OUT);
        assert!(hash::sha3_256(secret) == order.secret_hash, E_INVALID_SECRET);

        let original_resolver = order.committed_resolver;
        
        // Transfer penalty to rescuer
        let penalty = get_resolver_deposit(state, original_resolver);
        remove_resolver_deposit(state, original_resolver);
        
        let deposit = coin::withdraw<CoinType>(&account::create_signer_with_capability(&account::create_test_signer_cap(relayer_addr)), penalty);
        coin::deposit(rescuer_addr, deposit);

        order.state = ORDER_RESCUED;

        event::emit(OrderRescuedEvent {
            order_id,
            original_resolver,
            rescue_resolver: rescuer_addr,
        });
    }

    /// Authorize resolver
    public entry fun authorize_resolver(
        relayer: &signer,
        resolver: address
    ) acquires RelayerState {
        let relayer_addr = signer::address_of(relayer);
        let state = borrow_global_mut<RelayerState>(relayer_addr);
        
        assert!(signer::address_of(relayer) == state.relayer, E_UNAUTHORIZED);
        
        if (!vector::contains(&state.authorized_resolvers, &resolver)) {
            vector::push_back(&mut state.authorized_resolvers, resolver);
        };
    }

    /// Helper functions
    fun order_exists(orders: &vector<SwapOrder>, order_id: &vector<u8>): bool {
        let i = 0;
        let len = vector::length(orders);
        while (i < len) {
            let order = vector::borrow(orders, i);
            if (order.order_id == *order_id) {
                return true
            };
            i = i + 1;
        };
        false
    }

    fun find_order_index(orders: &vector<SwapOrder>, order_id: &vector<u8>): u64 {
        let i = 0;
        let len = vector::length(orders);
        while (i < len) {
            let order = vector::borrow(orders, i);
            if (order.order_id == *order_id) {
                return i
            };
            i = i + 1;
        };
        abort E_ORDER_NOT_FOUND
    }

    fun is_authorized_resolver(state: &RelayerState, resolver: address): bool {
        vector::contains(&state.authorized_resolvers, &resolver)
    }

    fun add_resolver_deposit(state: &mut RelayerState, resolver: address, amount: u64) {
        vector::push_back(&mut state.resolver_deposits, ResolverDeposit {
            resolver,
            amount,
        });
    }

    fun get_resolver_deposit(state: &RelayerState, resolver: address): u64 {
        let i = 0;
        let len = vector::length(&state.resolver_deposits);
        while (i < len) {
            let deposit = vector::borrow(&state.resolver_deposits, i);
            if (deposit.resolver == resolver) {
                return deposit.amount
            };
            i = i + 1;
        };
        0
    }

    fun remove_resolver_deposit(state: &mut RelayerState, resolver: address) {
        let i = 0;
        let len = vector::length(&state.resolver_deposits);
        while (i < len) {
            let deposit = vector::borrow(&state.resolver_deposits, i);
            if (deposit.resolver == resolver) {
                vector::remove(&mut state.resolver_deposits, i);
                return
            };
            i = i + 1;
        };
    }
}