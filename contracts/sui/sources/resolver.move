module resolver::resolver {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use std::vector;
    use std::option::{Self, Option};

    // Error codes
    const E_UNAUTHORIZED: u64 = 0;
    const E_INSUFFICIENT_BALANCE: u64 = 1;
    const E_ALREADY_REGISTERED: u64 = 2;
    const E_NOT_REGISTERED: u64 = 3;
    const E_INVALID_PROOF: u64 = 4;
    const E_ALREADY_CLAIMED: u64 = 5;

    // Resolver registry for cross-chain settlements
    struct ResolverRegistry has key {
        id: UID,
        owner: address,
        resolvers: Table<address, ResolverInfo>,
        deposits: Table<address, Balance<SUI>>,
        required_deposit: u64,
        total_resolvers: u64,
        paused: bool,
    }

    // Resolver information
    struct ResolverInfo has store {
        address: address,
        active: bool,
        total_settlements: u64,
        success_rate: u64, // Basis points (10000 = 100%)
        registered_at: u64,
    }

    // Settlement proof for cross-chain resolution
    struct SettlementProof has store, drop {
        order_hash: vector<u8>,
        src_chain_id: u64,
        dst_chain_id: u64,
        src_tx_hash: vector<u8>,
        dst_tx_hash: vector<u8>,
        resolver: address,
        timestamp: u64,
    }

    // Admin capability
    struct AdminCap has key {
        id: UID,
    }

    // Events
    struct ResolverRegistered has copy, drop {
        resolver: address,
        deposit: u64,
    }

    struct ResolverDeregistered has copy, drop {
        resolver: address,
        refund: u64,
    }

    struct SettlementCompleted has copy, drop {
        order_hash: vector<u8>,
        resolver: address,
        src_chain_id: u64,
        dst_chain_id: u64,
    }

    // Initialize registry
    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        
        let registry = ResolverRegistry {
            id: object::new(ctx),
            owner: sender,
            resolvers: table::new(ctx),
            deposits: table::new(ctx),
            required_deposit: 1000000000, // 1 SUI
            total_resolvers: 0,
            paused: false,
        };

        let admin_cap = AdminCap {
            id: object::new(ctx),
        };

        transfer::share_object(registry);
        transfer::transfer(admin_cap, sender);
    }

    // Register as a resolver
    public fun register_resolver(
        registry: &mut ResolverRegistry,
        deposit: Coin<SUI>,
        ctx: &mut TxContext,
    ) {
        let resolver_address = tx_context::sender(ctx);
        assert!(!registry.paused, E_UNAUTHORIZED);
        assert!(!table::contains(&registry.resolvers, resolver_address), E_ALREADY_REGISTERED);
        assert!(coin::value(&deposit) >= registry.required_deposit, E_INSUFFICIENT_BALANCE);

        let resolver_info = ResolverInfo {
            address: resolver_address,
            active: true,
            total_settlements: 0,
            success_rate: 10000, // Start with 100%
            registered_at: tx_context::epoch(ctx),
        };

        table::add(&mut registry.resolvers, resolver_address, resolver_info);
        
        // Store deposit
        if (table::contains(&registry.deposits, resolver_address)) {
            balance::join(
                table::borrow_mut(&mut registry.deposits, resolver_address),
                coin::into_balance(deposit)
            );
        } else {
            table::add(&mut registry.deposits, resolver_address, coin::into_balance(deposit));
        }

        registry.total_resolvers = registry.total_resolvers + 1;

        event::emit(ResolverRegistered {
            resolver: resolver_address,
            deposit: coin::value(&deposit),
        });
    }

    // Deregister as a resolver
    public fun deregister_resolver(
        registry: &mut ResolverRegistry,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        let resolver_address = tx_context::sender(ctx);
        assert!(table::contains(&registry.resolvers, resolver_address), E_NOT_REGISTERED);

        // Remove resolver info
        let resolver_info = table::remove(&mut registry.resolvers, resolver_address);
        registry.total_resolvers = registry.total_resolvers - 1;

        // Return deposit
        let deposit_balance = table::remove(&mut registry.deposits, resolver_address);
        let refund_amount = balance::value(&deposit_balance);
        let refund = coin::from_balance(deposit_balance, ctx);

        event::emit(ResolverDeregistered {
            resolver: resolver_address,
            refund: refund_amount,
        });

        refund
    }

    // Submit settlement proof
    public fun submit_settlement(
        registry: &mut ResolverRegistry,
        order_hash: vector<u8>,
        src_chain_id: u64,
        dst_chain_id: u64,
        src_tx_hash: vector<u8>,
        dst_tx_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        let resolver_address = tx_context::sender(ctx);
        assert!(table::contains(&registry.resolvers, resolver_address), E_NOT_REGISTERED);
        
        let resolver_info = table::borrow_mut(&mut registry.resolvers, resolver_address);
        assert!(resolver_info.active, E_UNAUTHORIZED);

        // Update resolver stats
        resolver_info.total_settlements = resolver_info.total_settlements + 1;

        event::emit(SettlementCompleted {
            order_hash,
            resolver: resolver_address,
            src_chain_id,
            dst_chain_id,
        });
    }

    // Admin functions
    public fun set_required_deposit(
        registry: &mut ResolverRegistry,
        _cap: &AdminCap,
        amount: u64,
    ) {
        registry.required_deposit = amount;
    }

    public fun pause_registry(registry: &mut ResolverRegistry, _cap: &AdminCap) {
        registry.paused = true;
    }

    public fun unpause_registry(registry: &mut ResolverRegistry, _cap: &AdminCap) {
        registry.paused = false;
    }

    public fun slash_resolver(
        registry: &mut ResolverRegistry,
        _cap: &AdminCap,
        resolver: address,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        assert!(table::contains(&registry.resolvers, resolver), E_NOT_REGISTERED);
        
        let deposit_balance = table::borrow_mut(&mut registry.deposits, resolver);
        assert!(balance::value(deposit_balance) >= amount, E_INSUFFICIENT_BALANCE);
        
        coin::from_balance(balance::split(deposit_balance, amount), ctx)
    }

    // View functions
    public fun is_resolver(registry: &ResolverRegistry, address: address): bool {
        table::contains(&registry.resolvers, address)
    }

    public fun get_resolver_info(registry: &ResolverRegistry, address: address): &ResolverInfo {
        assert!(table::contains(&registry.resolvers, address), E_NOT_REGISTERED);
        table::borrow(&registry.resolvers, address)
    }

    public fun total_resolvers(registry: &ResolverRegistry): u64 {
        registry.total_resolvers
    }

    public fun required_deposit(registry: &ResolverRegistry): u64 {
        registry.required_deposit
    }
}