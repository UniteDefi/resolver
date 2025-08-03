module unite::escrow_factory {
    use std::vector;
    use std::option::{Self, Option};
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Clock};
    use sui::dynamic_field;
    use sui::table::{Self, Table};

    use unite::escrow::{Self, SuiEscrow, CoinEscrow, EscrowCap, Timelocks};
    use unite::mock_dai::{MOCK_DAI};
    use unite::mock_usdt::{MOCK_USDT};

    // === Errors ===
    const EInsufficientSafetyDeposit: u64 = 1;
    const EEscrowAlreadyExists: u64 = 2;
    const EInvalidAmount: u64 = 3;
    const EResolverAlreadyExists: u64 = 4;
    const EEscrowNotFound: u64 = 5;
    const EUnauthorized: u64 = 6;

    // === Structs ===
    
    /// Factory state for managing escrows
    public struct EscrowFactory has key, store {
        id: UID,
        admin: address,
        // Track escrows by order hash
        src_escrows: Table<vector<u8>, ID>, // order_hash -> escrow_id
        dst_escrows: Table<vector<u8>, ID>, // order_hash -> escrow_id
        // Track resolver participation
        resolver_partial_amounts: Table<vector<u8>, Table<address, u64>>, // order_hash -> resolver -> amount
        resolver_safety_deposits: Table<vector<u8>, Table<address, u64>>, // order_hash -> resolver -> deposit
        total_filled_amounts: Table<vector<u8>, u64>, // order_hash -> total filled
    }

    /// Admin capability for factory
    public struct FactoryAdminCap has key, store {
        id: UID,
        factory_id: ID,
    }

    // === Events ===
    
    public struct EscrowFactoryCreated has copy, drop {
        factory_id: ID,
        admin: address,
    }

    public struct EscrowCreatedEvent has copy, drop {
        escrow_id: ID,
        order_hash: vector<u8>,
        is_source: bool,
        factory_id: ID,
    }

    public struct ResolverAddedEvent has copy, drop {
        escrow_id: ID,
        order_hash: vector<u8>,
        resolver: address,
        partial_amount: u64,
        safety_deposit: u64,
    }

    // === Public Functions ===

    /// Initialize the factory
    fun init(ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);
        
        let factory = EscrowFactory {
            id: object::new(ctx),
            admin,
            src_escrows: table::new(ctx),
            dst_escrows: table::new(ctx),
            resolver_partial_amounts: table::new(ctx),
            resolver_safety_deposits: table::new(ctx),
            total_filled_amounts: table::new(ctx),
        };

        let factory_id = object::id(&factory);

        let admin_cap = FactoryAdminCap {
            id: object::new(ctx),
            factory_id,
        };

        event::emit(EscrowFactoryCreated {
            factory_id,
            admin,
        });

        transfer::share_object(factory);
        transfer::transfer(admin_cap, admin);
    }

    /// Create a new factory (for testing)
    public fun create_factory(ctx: &mut TxContext): (EscrowFactory, FactoryAdminCap) {
        let admin = tx_context::sender(ctx);
        
        let factory = EscrowFactory {
            id: object::new(ctx),
            admin,
            src_escrows: table::new(ctx),
            dst_escrows: table::new(ctx),
            resolver_partial_amounts: table::new(ctx),
            resolver_safety_deposits: table::new(ctx),
            total_filled_amounts: table::new(ctx),
        };

        let factory_id = object::id(&factory);

        let admin_cap = FactoryAdminCap {
            id: object::new(ctx),
            factory_id,
        };

        event::emit(EscrowFactoryCreated {
            factory_id,
            admin,
        });

        (factory, admin_cap)
    }

    /// Create source escrow with partial amount
    public fun create_src_escrow_partial(
        factory: &mut EscrowFactory,
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        total_amount: u64,
        safety_deposit_per_unit: u64,
        timelocks: Timelocks,
        partial_amount: u64,
        resolver: address,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ): ID {
        assert!(partial_amount > 0 && partial_amount <= total_amount, EInvalidAmount);
        
        // Capture safety deposit value before it might be moved
        let safety_deposit_value = coin::value(&safety_deposit);
        
        // Calculate required safety deposit
        let required_safety_deposit = (safety_deposit_per_unit * partial_amount) / total_amount;
        assert!(safety_deposit_value >= required_safety_deposit, EInsufficientSafetyDeposit);
        
        let escrow_id = if (table::contains(&factory.src_escrows, order_hash)) {
            // Escrow already exists, add resolver to it
            let existing_escrow_id = *table::borrow(&factory.src_escrows, order_hash);
            
            // Check if resolver already participated
            if (!table::contains(&factory.resolver_partial_amounts, order_hash)) {
                table::add(&mut factory.resolver_partial_amounts, order_hash, table::new(ctx));
                table::add(&mut factory.resolver_safety_deposits, order_hash, table::new(ctx));
            };
            
            let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
            let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
            
            assert!(!table::contains(resolver_amounts, resolver), EResolverAlreadyExists);
            
            table::add(resolver_amounts, resolver, partial_amount);
            table::add(resolver_deposits, resolver, safety_deposit_value);
            
            // Update total filled amount
            if (table::contains(&factory.total_filled_amounts, order_hash)) {
                let current_total = table::remove(&mut factory.total_filled_amounts, order_hash);
                table::add(&mut factory.total_filled_amounts, order_hash, current_total + partial_amount);
            } else {
                table::add(&mut factory.total_filled_amounts, order_hash, partial_amount);
            };
            
            // Transfer safety deposit to factory admin
            transfer::public_transfer(safety_deposit, factory.admin);
            
            existing_escrow_id
        } else {
            // Create new escrow
            let (escrow, _cap) = escrow::create_sui_escrow_src(
                order_hash,
                hashlock,
                maker,
                taker,
                total_amount,
                safety_deposit_per_unit,
                timelocks,
                resolver,
                partial_amount,
                safety_deposit,
                clock,
                ctx
            );
            
            let escrow_id = object::id(&escrow);
            
            // Store escrow ID
            table::add(&mut factory.src_escrows, order_hash, escrow_id);
            
            // Track resolver participation
            let mut resolver_amounts = table::new(ctx);
            let mut resolver_deposits = table::new(ctx);
            table::add(&mut resolver_amounts, resolver, partial_amount);
            table::add(&mut resolver_deposits, resolver, safety_deposit_value);
            
            table::add(&mut factory.resolver_partial_amounts, order_hash, resolver_amounts);
            table::add(&mut factory.resolver_safety_deposits, order_hash, resolver_deposits);
            table::add(&mut factory.total_filled_amounts, order_hash, partial_amount);
            
            // Transfer escrow to be shared
            transfer::public_share_object(escrow);
            // Transfer capability to factory admin for management
            transfer::public_transfer(_cap, factory.admin);
            
            escrow_id
        };

        event::emit(EscrowCreatedEvent {
            escrow_id,
            order_hash,
            is_source: true,
            factory_id: object::id(factory),
        });

        event::emit(ResolverAddedEvent {
            escrow_id,
            order_hash,
            resolver,
            partial_amount,
            safety_deposit: safety_deposit_value,
        });

        escrow_id
    }

    /// Create destination escrow with partial amount
    public fun create_dst_escrow_partial(
        factory: &mut EscrowFactory,
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        total_amount: u64,
        safety_deposit_per_unit: u64,
        timelocks: Timelocks,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        resolver: address,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ): ID {
        assert!(partial_amount > 0 && partial_amount <= total_amount, EInvalidAmount);
        
        // Capture safety deposit value before it might be moved
        let safety_deposit_value = coin::value(&safety_deposit);
        
        // Calculate required safety deposit
        let required_safety_deposit = (safety_deposit_per_unit * partial_amount) / total_amount;
        assert!(safety_deposit_value >= required_safety_deposit, EInsufficientSafetyDeposit);
        
        let escrow_id = if (table::contains(&factory.dst_escrows, order_hash)) {
            // Escrow already exists, add resolver to it
            let existing_escrow_id = *table::borrow(&factory.dst_escrows, order_hash);
            
            // Check if resolver already participated
            if (!table::contains(&factory.resolver_partial_amounts, order_hash)) {
                table::add(&mut factory.resolver_partial_amounts, order_hash, table::new(ctx));
                table::add(&mut factory.resolver_safety_deposits, order_hash, table::new(ctx));
            };
            
            let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
            let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
            
            assert!(!table::contains(resolver_amounts, resolver), EResolverAlreadyExists);
            
            table::add(resolver_amounts, resolver, partial_amount);
            table::add(resolver_deposits, resolver, safety_deposit_value);
            
            // Update total filled amount
            if (table::contains(&factory.total_filled_amounts, order_hash)) {
                let current_total = table::remove(&mut factory.total_filled_amounts, order_hash);
                table::add(&mut factory.total_filled_amounts, order_hash, current_total + partial_amount);
            } else {
                table::add(&mut factory.total_filled_amounts, order_hash, partial_amount);
            };
            
            // Transfer safety deposit to factory admin
            transfer::public_transfer(safety_deposit, factory.admin);
            
            existing_escrow_id
        } else {
            // Create new escrow
            let (escrow, _cap) = escrow::create_sui_escrow_dst(
                order_hash,
                hashlock,
                maker,
                taker,
                total_amount,
                safety_deposit_per_unit,
                timelocks,
                src_cancellation_timestamp,
                resolver,
                partial_amount,
                safety_deposit,
                clock,
                ctx
            );
            
            let escrow_id = object::id(&escrow);
            
            // Store escrow ID
            table::add(&mut factory.dst_escrows, order_hash, escrow_id);
            
            // Track resolver participation
            let mut resolver_amounts = table::new(ctx);
            let mut resolver_deposits = table::new(ctx);
            table::add(&mut resolver_amounts, resolver, partial_amount);
            table::add(&mut resolver_deposits, resolver, safety_deposit_value);
            
            table::add(&mut factory.resolver_partial_amounts, order_hash, resolver_amounts);
            table::add(&mut factory.resolver_safety_deposits, order_hash, resolver_deposits);
            table::add(&mut factory.total_filled_amounts, order_hash, partial_amount);
            
            // Transfer escrow to be shared
            transfer::public_share_object(escrow);
            // Transfer capability to factory admin for management
            transfer::public_transfer(_cap, factory.admin);
            
            escrow_id
        };

        event::emit(EscrowCreatedEvent {
            escrow_id,
            order_hash,
            is_source: false,
            factory_id: object::id(factory),
        });

        event::emit(ResolverAddedEvent {
            escrow_id,
            order_hash,
            resolver,
            partial_amount,
            safety_deposit: safety_deposit_value,
        });

        escrow_id
    }

    /// Add resolver to existing source escrow
    public fun add_resolver_to_src_escrow(
        factory: &mut EscrowFactory,
        escrow: &mut SuiEscrow,
        order_hash: vector<u8>,
        resolver: address,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&factory.src_escrows, order_hash), EEscrowNotFound);
        
        // Check if resolver already participated
        let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
        let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
        
        assert!(!table::contains(resolver_amounts, resolver), EResolverAlreadyExists);
        
        let safety_deposit_value = coin::value(&safety_deposit);
        
        // Add resolver to escrow
        escrow::add_resolver_to_sui_escrow(escrow, resolver, partial_amount, safety_deposit, ctx);
        
        // Track in factory
        table::add(resolver_amounts, resolver, partial_amount);
        table::add(resolver_deposits, resolver, safety_deposit_value);
        
        // Update total filled amount
        let current_total = table::remove(&mut factory.total_filled_amounts, order_hash);
        table::add(&mut factory.total_filled_amounts, order_hash, current_total + partial_amount);

        let escrow_id = *table::borrow(&factory.src_escrows, order_hash);
        
        event::emit(ResolverAddedEvent {
            escrow_id,
            order_hash,
            resolver,
            partial_amount,
            safety_deposit: safety_deposit_value,
        });
    }

    /// Add resolver to existing destination escrow
    public fun add_resolver_to_dst_escrow(
        factory: &mut EscrowFactory,
        escrow: &mut SuiEscrow,
        order_hash: vector<u8>,
        resolver: address,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&factory.dst_escrows, order_hash), EEscrowNotFound);
        
        // Check if resolver already participated
        let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
        let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
        
        assert!(!table::contains(resolver_amounts, resolver), EResolverAlreadyExists);
        
        let safety_deposit_value = coin::value(&safety_deposit);
        
        // Add resolver to escrow
        escrow::add_resolver_to_sui_escrow(escrow, resolver, partial_amount, safety_deposit, ctx);
        
        // Track in factory
        table::add(resolver_amounts, resolver, partial_amount);
        table::add(resolver_deposits, resolver, safety_deposit_value);
        
        // Update total filled amount
        let current_total = table::remove(&mut factory.total_filled_amounts, order_hash);
        table::add(&mut factory.total_filled_amounts, order_hash, current_total + partial_amount);

        let escrow_id = *table::borrow(&factory.dst_escrows, order_hash);
        
        event::emit(ResolverAddedEvent {
            escrow_id,
            order_hash,
            resolver,
            partial_amount,
            safety_deposit: safety_deposit_value,
        });
    }

    /// Mark user funds as transferred to source escrow
    public fun mark_user_funded(
        factory: &mut EscrowFactory,
        escrow: &mut SuiEscrow,
        order_hash: vector<u8>,
        _admin_cap: &FactoryAdminCap
    ) {
        assert!(table::contains(&factory.src_escrows, order_hash), EEscrowNotFound);
        escrow::mark_user_funded(escrow);
    }

    // === View Functions ===
    
    public fun get_src_escrow_id(factory: &EscrowFactory, order_hash: vector<u8>): Option<ID> {
        if (table::contains(&factory.src_escrows, order_hash)) {
            option::some(*table::borrow(&factory.src_escrows, order_hash))
        } else {
            option::none()
        }
    }
    
    public fun get_dst_escrow_id(factory: &EscrowFactory, order_hash: vector<u8>): Option<ID> {
        if (table::contains(&factory.dst_escrows, order_hash)) {
            option::some(*table::borrow(&factory.dst_escrows, order_hash))
        } else {
            option::none()
        }
    }
    
    public fun get_total_filled_amount(factory: &EscrowFactory, order_hash: vector<u8>): u64 {
        if (table::contains(&factory.total_filled_amounts, order_hash)) {
            *table::borrow(&factory.total_filled_amounts, order_hash)
        } else {
            0
        }
    }
    
    public fun get_resolver_partial_amount(factory: &EscrowFactory, order_hash: vector<u8>, resolver: address): u64 {
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
    
    public fun get_resolver_safety_deposit(factory: &EscrowFactory, order_hash: vector<u8>, resolver: address): u64 {
        if (table::contains(&factory.resolver_safety_deposits, order_hash)) {
            let resolver_deposits = table::borrow(&factory.resolver_safety_deposits, order_hash);
            if (table::contains(resolver_deposits, resolver)) {
                *table::borrow(resolver_deposits, resolver)
            } else {
                0
            }
        } else {
            0
        }
    }
    
    public fun get_factory_admin(factory: &EscrowFactory): address {
        factory.admin
    }
    
    // === DAI Escrow Functions ===
    
    /// Create DAI destination escrow with partial amount
    public fun create_dai_dst_escrow_partial(
        factory: &mut EscrowFactory,
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        total_amount: u64,
        safety_deposit_per_unit: u64,
        timelocks: Timelocks,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        resolver: address,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ): ID {
        assert!(partial_amount > 0 && partial_amount <= total_amount, EInvalidAmount);
        
        let safety_deposit_value = coin::value(&safety_deposit);
        let required_safety_deposit = (safety_deposit_per_unit * partial_amount) / total_amount;
        assert!(safety_deposit_value >= required_safety_deposit, EInsufficientSafetyDeposit);
        
        let escrow_id = if (table::contains(&factory.dst_escrows, order_hash)) {
            let existing_escrow_id = *table::borrow(&factory.dst_escrows, order_hash);
            
            if (!table::contains(&factory.resolver_partial_amounts, order_hash)) {
                table::add(&mut factory.resolver_partial_amounts, order_hash, table::new(ctx));
                table::add(&mut factory.resolver_safety_deposits, order_hash, table::new(ctx));
            };
            
            let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
            let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
            
            assert!(!table::contains(resolver_amounts, resolver), EResolverAlreadyExists);
            
            table::add(resolver_amounts, resolver, partial_amount);
            table::add(resolver_deposits, resolver, safety_deposit_value);
            
            if (table::contains(&factory.total_filled_amounts, order_hash)) {
                let current_total = table::remove(&mut factory.total_filled_amounts, order_hash);
                table::add(&mut factory.total_filled_amounts, order_hash, current_total + partial_amount);
            } else {
                table::add(&mut factory.total_filled_amounts, order_hash, partial_amount);
            };
            
            transfer::public_transfer(safety_deposit, factory.admin);
            existing_escrow_id
        } else {
            let (escrow, _cap) = escrow::create_coin_escrow_dst<MOCK_DAI>(
                order_hash,
                hashlock,
                maker,
                taker,
                total_amount,
                safety_deposit_per_unit,
                timelocks,
                src_cancellation_timestamp,
                resolver,
                partial_amount,
                safety_deposit,
                b"unite::mock_dai::MOCK_DAI",
                clock,
                ctx
            );
            
            let escrow_id = object::id(&escrow);
            table::add(&mut factory.dst_escrows, order_hash, escrow_id);
            
            let mut resolver_amounts = table::new(ctx);
            let mut resolver_deposits = table::new(ctx);
            table::add(&mut resolver_amounts, resolver, partial_amount);
            table::add(&mut resolver_deposits, resolver, safety_deposit_value);
            
            table::add(&mut factory.resolver_partial_amounts, order_hash, resolver_amounts);
            table::add(&mut factory.resolver_safety_deposits, order_hash, resolver_deposits);
            table::add(&mut factory.total_filled_amounts, order_hash, partial_amount);
            
            transfer::public_share_object(escrow);
            transfer::public_transfer(_cap, factory.admin);
            escrow_id
        };

        event::emit(EscrowCreatedEvent {
            escrow_id,
            order_hash,
            is_source: false,
            factory_id: object::id(factory),
        });

        event::emit(ResolverAddedEvent {
            escrow_id,
            order_hash,
            resolver,
            partial_amount,
            safety_deposit: safety_deposit_value,
        });

        escrow_id
    }
    
    /// Add resolver to existing DAI destination escrow
    public fun add_resolver_to_dai_dst_escrow(
        factory: &mut EscrowFactory,
        escrow: &mut CoinEscrow<MOCK_DAI>,
        order_hash: vector<u8>,
        resolver: address,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&factory.dst_escrows, order_hash), EEscrowNotFound);
        
        // Check if resolver already participated
        let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
        let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
        
        assert!(!table::contains(resolver_amounts, resolver), EResolverAlreadyExists);
        
        let safety_deposit_value = coin::value(&safety_deposit);
        
        // Add resolver to escrow
        escrow::add_resolver_to_coin_escrow(escrow, resolver, partial_amount, safety_deposit, ctx);
        
        // Track in factory
        table::add(resolver_amounts, resolver, partial_amount);
        table::add(resolver_deposits, resolver, safety_deposit_value);
        
        // Update total filled amount
        let current_total = table::remove(&mut factory.total_filled_amounts, order_hash);
        table::add(&mut factory.total_filled_amounts, order_hash, current_total + partial_amount);

        let escrow_id = *table::borrow(&factory.dst_escrows, order_hash);
        
        event::emit(ResolverAddedEvent {
            escrow_id,
            order_hash,
            resolver,
            partial_amount,
            safety_deposit: safety_deposit_value,
        });
    }
}