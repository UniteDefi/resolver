module aptos_addr::escrow_factory {
    use std::signer;
    use std::vector;
    use std::string::String;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::aptos_account;
    use aptos_std::table::{Self, Table};
    use aptos_std::type_info;
    use aptos_addr::escrow::{Self, Immutables};

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INSUFFICIENT_SAFETY_DEPOSIT: u64 = 2;
    const E_ESCROW_ALREADY_EXISTS: u64 = 3;
    const E_INVALID_AMOUNT: u64 = 4;
    const E_RESOLVER_ALREADY_EXISTS: u64 = 5;
    const E_ESCROW_NOT_FOUND: u64 = 6;

    struct EscrowFactory has key {
        // Track escrow addresses
        src_escrows: Table<vector<u8>, address>, // order_hash -> escrow_address
        dst_escrows: Table<vector<u8>, address>, // order_hash -> escrow_address
        
        // Track resolver participation
        resolver_partial_amounts: Table<vector<u8>, Table<address, u64>>, // order_hash -> resolver -> amount
        resolver_safety_deposits: Table<vector<u8>, Table<address, u64>>, // order_hash -> resolver -> deposit
        total_filled_amounts: Table<vector<u8>, u64>, // order_hash -> total_filled
        
        // Authority
        admin: address,
        
        // Resource account capability for creating escrows
        signer_capability: account::SignerCapability,
        
        // Events
        escrow_created_events: EventHandle<EscrowCreatedEvent>,
        resolver_added_events: EventHandle<ResolverAddedFactoryEvent>,
    }

    struct EscrowCreatedEvent has drop, store {
        escrow_address: address,
        order_hash: vector<u8>,
        is_source: bool,
        coin_type: String,
    }

    struct ResolverAddedFactoryEvent has drop, store {
        escrow_address: address,
        resolver: address,
        partial_amount: u64,
        safety_deposit: u64,
    }

    // Initialize factory
    entry public fun initialize(admin: &signer) {
        let admin_addr = signer::address_of(admin);
        
        // Create a resource account for the factory
        let (_resource_signer, signer_capability) = account::create_resource_account(
            admin, 
            b"UNITE_ESCROW_FACTORY_SEED"
        );
        
        let factory = EscrowFactory {
            src_escrows: table::new(),
            dst_escrows: table::new(),
            resolver_partial_amounts: table::new(),
            resolver_safety_deposits: table::new(),
            total_filled_amounts: table::new(),
            admin: admin_addr,
            signer_capability,
            escrow_created_events: account::new_event_handle<EscrowCreatedEvent>(admin),
            resolver_added_events: account::new_event_handle<ResolverAddedFactoryEvent>(admin),
        };
        
        move_to(admin, factory);
    }

    // Create source escrow with partial amount
    public fun create_src_escrow_partial<CoinType>(
        resolver: &signer,
        immutables: Immutables,
        partial_amount: u64,
        safety_deposit_apt: Coin<AptosCoin>,
        factory_addr: address,
    ): address acquires EscrowFactory {
        let resolver_addr = signer::address_of(resolver);
        create_src_escrow_partial_for<CoinType>(
            resolver_addr, immutables, partial_amount, safety_deposit_apt, factory_addr
        )
    }

    // Create source escrow for specific resolver
    public fun create_src_escrow_partial_for<CoinType>(
        resolver_addr: address,
        immutables: Immutables,
        partial_amount: u64,
        safety_deposit_apt: Coin<AptosCoin>,
        factory_addr: address,
    ): address acquires EscrowFactory {
        let factory = borrow_global_mut<EscrowFactory>(factory_addr);
        
        assert!(partial_amount > 0 && partial_amount <= escrow::get_amount(&immutables), E_INVALID_AMOUNT);
        
        // Calculate required safety deposit
        let required_safety_deposit = (escrow::get_safety_deposit(&immutables) * partial_amount) / escrow::get_amount(&immutables);
        assert!(coin::value(&safety_deposit_apt) >= required_safety_deposit, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        // Check if resolver already participated
        let order_hash = escrow::get_order_hash(&immutables);
        if (table::contains(&factory.resolver_partial_amounts, order_hash)) {
            let resolver_amounts = table::borrow(&factory.resolver_partial_amounts, order_hash);
            assert!(!table::contains(resolver_amounts, resolver_addr), E_RESOLVER_ALREADY_EXISTS);
        };
        
        let escrow_addr = if (table::contains(&factory.src_escrows, order_hash)) {
            // Escrow exists, add resolver to it
            let existing_addr = *table::borrow(&factory.src_escrows, order_hash);
            
            // Add resolver to existing escrow
            escrow::add_resolver<CoinType>(resolver_addr, partial_amount, required_safety_deposit, existing_addr);
            
            // Deposit safety deposit
            aptos_account::deposit_coins(existing_addr, safety_deposit_apt);
            
            existing_addr
        } else {
            // Create new escrow
            let factory_signer = account::create_signer_with_capability(&factory.signer_capability);
            let (escrow_account, _cap) = account::create_resource_account(&factory_signer, order_hash);
            let escrow_addr = signer::address_of(&escrow_account);
            
            // Initialize escrow
            escrow::initialize<CoinType>(&escrow_account, immutables, true, 0);
            
            // Add first resolver
            escrow::add_resolver<CoinType>(resolver_addr, partial_amount, required_safety_deposit, escrow_addr);
            
            // Deposit safety deposit
            aptos_account::deposit_coins(escrow_addr, safety_deposit_apt);
            
            // Store escrow address
            table::add(&mut factory.src_escrows, order_hash, escrow_addr);
            
            // Emit event
            event::emit_event(&mut factory.escrow_created_events, EscrowCreatedEvent {
                escrow_address: escrow_addr,
                order_hash,
                is_source: true,
                coin_type: type_info::type_name<CoinType>(),
            });
            
            escrow_addr
        };
        
        // Track resolver participation
        if (!table::contains(&factory.resolver_partial_amounts, order_hash)) {
            table::add(&mut factory.resolver_partial_amounts, order_hash, table::new());
            table::add(&mut factory.resolver_safety_deposits, order_hash, table::new());
            table::add(&mut factory.total_filled_amounts, order_hash, 0);
        };
        
        let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
        table::add(resolver_amounts, resolver_addr, partial_amount);
        
        let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
        table::add(resolver_deposits, resolver_addr, required_safety_deposit);
        
        let total_filled = table::borrow_mut(&mut factory.total_filled_amounts, order_hash);
        *total_filled = *total_filled + partial_amount;
        
        // Emit event
        event::emit_event(&mut factory.resolver_added_events, ResolverAddedFactoryEvent {
            escrow_address: escrow_addr,
            resolver: resolver_addr,
            partial_amount,
            safety_deposit: required_safety_deposit,
        });
        
        escrow_addr
    }

    // Create destination escrow with partial amount
    public fun create_dst_escrow_partial<CoinType>(
        resolver: &signer,
        immutables: Immutables,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        safety_deposit_apt: Coin<AptosCoin>,
        factory_addr: address,
    ): address acquires EscrowFactory {
        let resolver_addr = signer::address_of(resolver);
        create_dst_escrow_partial_for<CoinType>(
            resolver_addr, immutables, src_cancellation_timestamp, partial_amount, safety_deposit_apt, factory_addr
        )
    }

    // Create destination escrow for specific resolver
    public fun create_dst_escrow_partial_for<CoinType>(
        resolver_addr: address,
        immutables: Immutables,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        safety_deposit_apt: Coin<AptosCoin>,
        factory_addr: address,
    ): address acquires EscrowFactory {
        let factory = borrow_global_mut<EscrowFactory>(factory_addr);
        
        assert!(partial_amount > 0 && partial_amount <= escrow::get_amount(&immutables), E_INVALID_AMOUNT);
        
        // Calculate required safety deposit
        let required_safety_deposit = (escrow::get_safety_deposit(&immutables) * partial_amount) / escrow::get_amount(&immutables);
        assert!(coin::value(&safety_deposit_apt) >= required_safety_deposit, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        // Check if resolver already participated
        let order_hash = escrow::get_order_hash(&immutables);
        if (table::contains(&factory.resolver_partial_amounts, order_hash)) {
            let resolver_amounts = table::borrow(&factory.resolver_partial_amounts, order_hash);
            assert!(!table::contains(resolver_amounts, resolver_addr), E_RESOLVER_ALREADY_EXISTS);
        };
        
        // Use different seed for destination escrows
        let dst_seed = order_hash;
        vector::append(&mut dst_seed, b"DST");
        
        let escrow_addr = if (table::contains(&factory.dst_escrows, order_hash)) {
            // Escrow exists, add resolver to it
            let existing_addr = *table::borrow(&factory.dst_escrows, order_hash);
            
            // Add resolver to existing escrow
            escrow::add_resolver<CoinType>(resolver_addr, partial_amount, required_safety_deposit, existing_addr);
            
            // Deposit safety deposit
            aptos_account::deposit_coins(existing_addr, safety_deposit_apt);
            
            existing_addr
        } else {
            // Create new escrow
            let factory_signer = account::create_signer_with_capability(&factory.signer_capability);
            let (escrow_account, _cap) = account::create_resource_account(&factory_signer, dst_seed);
            let escrow_addr = signer::address_of(&escrow_account);
            
            // Initialize escrow
            escrow::initialize<CoinType>(&escrow_account, immutables, false, src_cancellation_timestamp);
            
            // Add first resolver
            escrow::add_resolver<CoinType>(resolver_addr, partial_amount, required_safety_deposit, escrow_addr);
            
            // Deposit safety deposit
            aptos_account::deposit_coins(escrow_addr, safety_deposit_apt);
            
            // Store escrow address
            table::add(&mut factory.dst_escrows, order_hash, escrow_addr);
            
            // Emit event
            event::emit_event(&mut factory.escrow_created_events, EscrowCreatedEvent {
                escrow_address: escrow_addr,
                order_hash,
                is_source: false,
                coin_type: type_info::type_name<CoinType>(),
            });
            
            escrow_addr
        };
        
        // Track resolver participation
        if (!table::contains(&factory.resolver_partial_amounts, order_hash)) {
            table::add(&mut factory.resolver_partial_amounts, order_hash, table::new());
            table::add(&mut factory.resolver_safety_deposits, order_hash, table::new());
            table::add(&mut factory.total_filled_amounts, order_hash, 0);
        };
        
        let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
        table::add(resolver_amounts, resolver_addr, partial_amount);
        
        let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
        table::add(resolver_deposits, resolver_addr, required_safety_deposit);
        
        let total_filled = table::borrow_mut(&mut factory.total_filled_amounts, order_hash);
        *total_filled = *total_filled + partial_amount;
        
        // Emit event
        event::emit_event(&mut factory.resolver_added_events, ResolverAddedFactoryEvent {
            escrow_address: escrow_addr,
            resolver: resolver_addr,
            partial_amount,
            safety_deposit: required_safety_deposit,
        });
        
        escrow_addr
    }

    // Transfer user funds to escrow after all resolvers commit
    public fun transfer_user_funds<CoinType>(
        admin: &signer,
        order_hash: vector<u8>,
        user_coins: Coin<CoinType>,
        factory_addr: address,
    ) acquires EscrowFactory {
        let factory = borrow_global<EscrowFactory>(factory_addr);
        assert!(signer::address_of(admin) == factory.admin, E_NOT_AUTHORIZED);
        
        assert!(table::contains(&factory.src_escrows, order_hash), E_ESCROW_NOT_FOUND);
        let escrow_addr = *table::borrow(&factory.src_escrows, order_hash);
        
        // Deposit coins to escrow
        escrow::deposit_coins(user_coins, escrow_addr);
        
        // Mark escrow as funded
        escrow::mark_user_funded<CoinType>(escrow_addr);
    }


    // View functions
    #[view]
    public fun get_src_escrow_address(order_hash: vector<u8>, factory_addr: address): address acquires EscrowFactory {
        let factory = borrow_global<EscrowFactory>(factory_addr);
        if (table::contains(&factory.src_escrows, order_hash)) {
            *table::borrow(&factory.src_escrows, order_hash)
        } else {
            @0x0
        }
    }

    #[view]
    public fun get_dst_escrow_address(order_hash: vector<u8>, factory_addr: address): address acquires EscrowFactory {
        let factory = borrow_global<EscrowFactory>(factory_addr);
        if (table::contains(&factory.dst_escrows, order_hash)) {
            *table::borrow(&factory.dst_escrows, order_hash)
        } else {
            @0x0
        }
    }

    #[view]
    public fun get_total_filled_amount(order_hash: vector<u8>, factory_addr: address): u64 acquires EscrowFactory {
        let factory = borrow_global<EscrowFactory>(factory_addr);
        if (table::contains(&factory.total_filled_amounts, order_hash)) {
            *table::borrow(&factory.total_filled_amounts, order_hash)
        } else {
            0
        }
    }

    #[view]
    public fun get_resolver_partial_amount(order_hash: vector<u8>, resolver: address, factory_addr: address): u64 acquires EscrowFactory {
        let factory = borrow_global<EscrowFactory>(factory_addr);
        if (table::contains(&factory.resolver_partial_amounts, order_hash)) {
            let resolver_amounts = table::borrow(&factory.resolver_partial_amounts, order_hash);
            if (table::contains(resolver_amounts, resolver)) {
                *table::borrow(resolver_amounts, resolver)
            } else {
                0
            }
        } else {
            0
        }
    }
}