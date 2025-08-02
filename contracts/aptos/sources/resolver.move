module unite_resolver::resolver {
    use std::signer;
    use std::vector;
    use aptos_framework::event;
    
    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_ALREADY_REGISTERED: u64 = 2;
    const E_NOT_REGISTERED: u64 = 3;
    const E_INVALID_FEE: u64 = 4;

    struct ResolverRegistry has key {
        resolvers: vector<ResolverInfo>,
        resolver_count: u64,
    }

    struct ResolverInfo has store, copy, drop {
        address: address,
        name: vector<u8>,
        fee_bps: u64, // Fee in basis points (1 = 0.01%)
        is_active: bool,
        total_resolved: u64,
    }

    struct ResolverEvents has key {
        resolver_registered_events: event::EventHandle<ResolverRegisteredEvent>,
        resolver_updated_events: event::EventHandle<ResolverUpdatedEvent>,
        swap_resolved_events: event::EventHandle<SwapResolvedEvent>,
    }

    struct ResolverRegisteredEvent has drop, store {
        resolver: address,
        name: vector<u8>,
        fee_bps: u64,
    }

    struct ResolverUpdatedEvent has drop, store {
        resolver: address,
        fee_bps: u64,
        is_active: bool,
    }

    struct SwapResolvedEvent has drop, store {
        resolver: address,
        escrow_id: vector<u8>,
        secret: vector<u8>,
    }

    public fun initialize(admin: &signer) {
        move_to(admin, ResolverRegistry {
            resolvers: vector::empty(),
            resolver_count: 0,
        });
        
        move_to(admin, ResolverEvents {
            resolver_registered_events: event::new_event_handle<ResolverRegisteredEvent>(admin),
            resolver_updated_events: event::new_event_handle<ResolverUpdatedEvent>(admin),
            swap_resolved_events: event::new_event_handle<SwapResolvedEvent>(admin),
        });
    }

    public entry fun register_resolver(
        resolver: &signer,
        name: vector<u8>,
        fee_bps: u64,
    ) acquires ResolverRegistry, ResolverEvents {
        let resolver_address = signer::address_of(resolver);
        let registry = borrow_global_mut<ResolverRegistry>(@unite_resolver);
        
        // Check if already registered
        let i = 0;
        let len = vector::length(&registry.resolvers);
        while (i < len) {
            let info = vector::borrow(&registry.resolvers, i);
            assert!(info.address != resolver_address, E_ALREADY_REGISTERED);
            i = i + 1;
        };
        
        // Validate fee
        assert!(fee_bps <= 10000, E_INVALID_FEE); // Max 100%
        
        // Register resolver
        let resolver_info = ResolverInfo {
            address: resolver_address,
            name,
            fee_bps,
            is_active: true,
            total_resolved: 0,
        };
        
        vector::push_back(&mut registry.resolvers, resolver_info);
        registry.resolver_count = registry.resolver_count + 1;
        
        // Emit event
        let events = borrow_global_mut<ResolverEvents>(@unite_resolver);
        event::emit_event(&mut events.resolver_registered_events, ResolverRegisteredEvent {
            resolver: resolver_address,
            name,
            fee_bps,
        });
    }

    public entry fun update_resolver(
        resolver: &signer,
        fee_bps: u64,
        is_active: bool,
    ) acquires ResolverRegistry, ResolverEvents {
        let resolver_address = signer::address_of(resolver);
        let registry = borrow_global_mut<ResolverRegistry>(@unite_resolver);
        
        // Find resolver
        let i = 0;
        let len = vector::length(&registry.resolvers);
        let found = false;
        
        while (i < len) {
            let info = vector::borrow_mut(&mut registry.resolvers, i);
            if (info.address == resolver_address) {
                info.fee_bps = fee_bps;
                info.is_active = is_active;
                found = true;
                break
            };
            i = i + 1;
        };
        
        assert!(found, E_NOT_REGISTERED);
        
        // Emit event
        let events = borrow_global_mut<ResolverEvents>(@unite_resolver);
        event::emit_event(&mut events.resolver_updated_events, ResolverUpdatedEvent {
            resolver: resolver_address,
            fee_bps,
            is_active,
        });
    }

    public entry fun resolve_swap(
        resolver: &signer,
        escrow_id: vector<u8>,
        secret: vector<u8>,
    ) acquires ResolverRegistry, ResolverEvents {
        let resolver_address = signer::address_of(resolver);
        let registry = borrow_global_mut<ResolverRegistry>(@unite_resolver);
        
        // Find and update resolver stats
        let i = 0;
        let len = vector::length(&registry.resolvers);
        let found = false;
        
        while (i < len) {
            let info = vector::borrow_mut(&mut registry.resolvers, i);
            if (info.address == resolver_address) {
                assert!(info.is_active, E_NOT_AUTHORIZED);
                info.total_resolved = info.total_resolved + 1;
                found = true;
                break
            };
            i = i + 1;
        };
        
        assert!(found, E_NOT_REGISTERED);
        
        // TODO: Interact with escrow contract to resolve
        
        // Emit event
        let events = borrow_global_mut<ResolverEvents>(@unite_resolver);
        event::emit_event(&mut events.swap_resolved_events, SwapResolvedEvent {
            resolver: resolver_address,
            escrow_id,
            secret,
        });
    }

    #[view]
    public fun get_resolver_count(): u64 acquires ResolverRegistry {
        borrow_global<ResolverRegistry>(@unite_resolver).resolver_count
    }

    #[view]
    public fun get_resolver_info(resolver_address: address): (vector<u8>, u64, bool, u64) acquires ResolverRegistry {
        let registry = borrow_global<ResolverRegistry>(@unite_resolver);
        let i = 0;
        let len = vector::length(&registry.resolvers);
        
        while (i < len) {
            let info = vector::borrow(&registry.resolvers, i);
            if (info.address == resolver_address) {
                return (info.name, info.fee_bps, info.is_active, info.total_resolved)
            };
            i = i + 1;
        };
        
        abort E_NOT_REGISTERED
    }
}