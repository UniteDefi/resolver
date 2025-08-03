module unite::escrow_factory_v2 {
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Clock};
    use sui::table::{Self, Table};
    use sui::hash;
    use sui::bcs;
    
    use unite::escrow_v2::{Self, Escrow, Immutables};

    // === Errors ===
    const EInsufficientSafetyDeposit: u64 = 1;
    const EEscrowAlreadyExists: u64 = 2;
    const EInvalidImmutables: u64 = 3;
    const EResolverAlreadyExists: u64 = 4;
    const EInvalidAmount: u64 = 5;
    const ENotOwner: u64 = 6;
    const EEscrowNotFound: u64 = 7;
    const ENotEnoughCommitments: u64 = 8;

    // === Structs ===
    
    /// Factory state
    public struct EscrowFactory has key, store {
        id: UID,
        owner: address,
        src_escrows: Table<vector<u8>, ID>, // order_hash -> escrow ID
        dst_escrows: Table<vector<u8>, ID>, // order_hash -> escrow ID
        resolver_partial_amounts: Table<vector<u8>, Table<address, u64>>, // order_hash -> resolver -> amount
        resolver_safety_deposits: Table<vector<u8>, Table<address, u64>>, // order_hash -> resolver -> deposit
        total_filled_amounts: Table<vector<u8>, u64>, // order_hash -> total filled
    }

    /// Admin capability
    public struct FactoryAdminCap has key, store {
        id: UID,
        factory_id: ID,
    }

    // === Events ===
    
    public struct EscrowCreated has copy, drop {
        escrow_id: ID,
        order_hash: vector<u8>,
        is_source: bool,
    }

    public struct ResolverAdded has copy, drop {
        escrow_id: ID,
        resolver: address,
        amount: u64,
        safety_deposit: u64,
    }

    public struct FactoryCreated has copy, drop {
        factory_id: ID,
        owner: address,
    }

    // === Public Functions ===

    /// Create a new factory
    public fun create_factory(ctx: &mut TxContext): (EscrowFactory, FactoryAdminCap) {
        let owner = tx_context::sender(ctx);
        
        let factory = EscrowFactory {
            id: object::new(ctx),
            owner,
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

        event::emit(FactoryCreated {
            factory_id,
            owner,
        });

        (factory, admin_cap)
    }

    /// Compute escrow address for source chain (deterministic based on immutables)
    public fun address_of_escrow_src(immutables: &Immutables): vector<u8> {
        let salt = hash_immutables(immutables);
        // Return the hash as "address" - in Sui we'll use object IDs instead
        salt
    }

    /// Compute escrow address for destination chain (deterministic based on immutables)
    public fun address_of_escrow_dst(immutables: &Immutables): vector<u8> {
        let mut salt_input = b"DST";
        let immutables_hash = hash_immutables(immutables);
        vector::append(&mut salt_input, immutables_hash);
        hash::keccak256(&salt_input)
    }

    /// Create source escrow with partial fill support
    public fun create_src_escrow_partial_for<T>(
        factory: &mut EscrowFactory,
        immutables: Immutables,
        partial_amount: u64,
        resolver: address,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ): ID {
        assert!(partial_amount > 0 && partial_amount <= (escrow_v2::get_amount(&immutables) as u64), EInvalidAmount);
        
        // CONSTANT SAFETY DEPOSIT: Use the safety deposit from immutables directly
        let required_safety_deposit = (escrow_v2::get_safety_deposit(&immutables) as u64);
        assert!(coin::value(&safety_deposit) >= required_safety_deposit, EInsufficientSafetyDeposit);
        
        let order_hash = escrow_v2::get_order_hash(&immutables);
        
        // Check if resolver already participated
        if (table::contains(&factory.resolver_partial_amounts, order_hash)) {
            let resolver_amounts = table::borrow(&factory.resolver_partial_amounts, order_hash);
            assert!(!table::contains(resolver_amounts, resolver), EResolverAlreadyExists);
        };
        
        // Check if escrow already exists
        if (!table::contains(&factory.src_escrows, order_hash)) {
            // First resolver - create the escrow
            let mut escrow = escrow_v2::initialize<T>(immutables, true, clock, ctx);
            
            // Get safety deposit value before moving the coin
            let safety_deposit_value = coin::value(&safety_deposit);
            
            // Handle first resolver
            escrow_v2::handle_first_resolver(&mut escrow, resolver, partial_amount, safety_deposit_value);
            
            // Add safety deposit
            escrow_v2::deposit_safety_deposit(&mut escrow, safety_deposit, ctx);
            
            let escrow_id = object::id(&escrow);
            
            // Store escrow reference
            table::add(&mut factory.src_escrows, order_hash, escrow_id);
            
            // Initialize tracking tables
            let mut resolver_amounts = table::new<address, u64>(ctx);
            table::add(&mut resolver_amounts, resolver, partial_amount);
            table::add(&mut factory.resolver_partial_amounts, order_hash, resolver_amounts);
            
            let mut resolver_deposits = table::new<address, u64>(ctx);
            table::add(&mut resolver_deposits, resolver, safety_deposit_value);
            table::add(&mut factory.resolver_safety_deposits, order_hash, resolver_deposits);
            
            table::add(&mut factory.total_filled_amounts, order_hash, partial_amount);
            
            // Transfer escrow to shared object
            escrow_v2::share_escrow(escrow);
            
            event::emit(EscrowCreated {
                escrow_id,
                order_hash,
                is_source: true,
            });
            
            event::emit(ResolverAdded {
                escrow_id,
                resolver,
                amount: partial_amount,
                safety_deposit: safety_deposit_value,
            });
            
            escrow_id
        } else {
            // Subsequent resolvers - escrow already exists
            let escrow_id = *table::borrow(&factory.src_escrows, order_hash);
            
            // Update tracking tables
            let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
            table::add(resolver_amounts, resolver, partial_amount);
            
            let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
            table::add(resolver_deposits, resolver, coin::value(&safety_deposit));
            
            let total_filled = table::borrow_mut(&mut factory.total_filled_amounts, order_hash);
            *total_filled = *total_filled + partial_amount;
            
            // Note: The actual escrow update needs to happen in a separate transaction
            // since we can't access the shared escrow object here
            // The resolver will need to call add_resolver_safety_deposit directly on the escrow
            
            // For now, just burn the safety deposit coin
            // In practice, this would be sent to the escrow in a separate transaction
            transfer::public_transfer(safety_deposit, resolver);
            
            event::emit(ResolverAdded {
                escrow_id,
                resolver,
                amount: partial_amount,
                safety_deposit: required_safety_deposit,
            });
            
            escrow_id
        }
    }

    /// Create destination escrow with partial fill support
    public fun create_dst_escrow_partial_for<T>(
        factory: &mut EscrowFactory,
        immutables: Immutables,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        resolver: address,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext
    ): ID {
        assert!(partial_amount > 0, EInvalidAmount);
        
        // CONSTANT SAFETY DEPOSIT: Use the safety deposit from immutables directly
        let required_safety_deposit = (escrow_v2::get_safety_deposit(&immutables) as u64);
        assert!(coin::value(&safety_deposit) >= required_safety_deposit, EInsufficientSafetyDeposit);
        
        let order_hash = escrow_v2::get_order_hash(&immutables);
        
        // Check if resolver already participated
        if (table::contains(&factory.resolver_partial_amounts, order_hash)) {
            let resolver_amounts = table::borrow(&factory.resolver_partial_amounts, order_hash);
            assert!(!table::contains(resolver_amounts, resolver), EResolverAlreadyExists);
        };
        
        // Check if escrow already exists
        if (!table::contains(&factory.dst_escrows, order_hash)) {
            // First resolver - create the escrow
            let mut escrow = escrow_v2::initialize_dst<T>(immutables, src_cancellation_timestamp, clock, ctx);
            
            // Get safety deposit value before moving the coin
            let safety_deposit_value = coin::value(&safety_deposit);
            
            // Handle first resolver
            escrow_v2::handle_first_resolver(&mut escrow, resolver, partial_amount, safety_deposit_value);
            
            // Add safety deposit
            escrow_v2::deposit_safety_deposit(&mut escrow, safety_deposit, ctx);
            
            let escrow_id = object::id(&escrow);
            
            // Store escrow reference
            table::add(&mut factory.dst_escrows, order_hash, escrow_id);
            
            // Initialize tracking tables
            let mut resolver_amounts = table::new<address, u64>(ctx);
            table::add(&mut resolver_amounts, resolver, partial_amount);
            table::add(&mut factory.resolver_partial_amounts, order_hash, resolver_amounts);
            
            let mut resolver_deposits = table::new<address, u64>(ctx);
            table::add(&mut resolver_deposits, resolver, safety_deposit_value);
            table::add(&mut factory.resolver_safety_deposits, order_hash, resolver_deposits);
            
            table::add(&mut factory.total_filled_amounts, order_hash, partial_amount);
            
            // Transfer escrow to shared object
            escrow_v2::share_escrow(escrow);
            
            event::emit(EscrowCreated {
                escrow_id,
                order_hash,
                is_source: false,
            });
            
            event::emit(ResolverAdded {
                escrow_id,
                resolver,
                amount: partial_amount,
                safety_deposit: safety_deposit_value,
            });
            
            escrow_id
        } else {
            // Subsequent resolvers - escrow already exists
            let escrow_id = *table::borrow(&factory.dst_escrows, order_hash);
            
            // Update tracking tables
            let resolver_amounts = table::borrow_mut(&mut factory.resolver_partial_amounts, order_hash);
            table::add(resolver_amounts, resolver, partial_amount);
            
            let resolver_deposits = table::borrow_mut(&mut factory.resolver_safety_deposits, order_hash);
            table::add(resolver_deposits, resolver, coin::value(&safety_deposit));
            
            let total_filled = table::borrow_mut(&mut factory.total_filled_amounts, order_hash);
            *total_filled = *total_filled + partial_amount;
            
            // Note: The actual escrow update needs to happen in a separate transaction
            // since we can't access the shared escrow object here
            
            transfer::public_transfer(safety_deposit, resolver);
            
            event::emit(ResolverAdded {
                escrow_id,
                resolver,
                amount: partial_amount,
                safety_deposit: required_safety_deposit,
            });
            
            escrow_id
        }
    }

    /// Transfer user funds to escrow after all resolvers commit
    public fun transfer_user_funds<T>(
        factory: &EscrowFactory,
        escrow: &mut Escrow<T>,
        order_hash: vector<u8>,
        from: address,
        tokens: Coin<T>,
        amount: u64,
        _admin_cap: &FactoryAdminCap,
        ctx: &mut TxContext
    ) {
        assert!(table::contains(&factory.src_escrows, order_hash), EEscrowNotFound);
        assert!(coin::value(&tokens) >= amount, EInvalidAmount);
        
        let total_filled = table::borrow(&factory.total_filled_amounts, order_hash);
        assert!(*total_filled >= amount, ENotEnoughCommitments);
        
        // Deposit tokens to escrow
        escrow_v2::deposit_tokens(escrow, tokens, ctx);
        
        // Mark the escrow as funded
        escrow_v2::mark_user_funded(escrow);
    }

    // === View Functions ===
    
    public fun get_resolver_partial_amount(
        factory: &EscrowFactory,
        order_hash: vector<u8>,
        resolver: address
    ): u64 {
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
    
    public fun get_resolver_safety_deposit(
        factory: &EscrowFactory,
        order_hash: vector<u8>,
        resolver: address
    ): u64 {
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
    
    public fun get_total_filled_amount(
        factory: &EscrowFactory,
        order_hash: vector<u8>
    ): u64 {
        if (table::contains(&factory.total_filled_amounts, order_hash)) {
            *table::borrow(&factory.total_filled_amounts, order_hash)
        } else {
            0
        }
    }
    
    public fun get_src_escrow_id(
        factory: &EscrowFactory,
        order_hash: vector<u8>
    ): Option<ID> {
        if (table::contains(&factory.src_escrows, order_hash)) {
            option::some(*table::borrow(&factory.src_escrows, order_hash))
        } else {
            option::none()
        }
    }
    
    public fun get_dst_escrow_id(
        factory: &EscrowFactory,
        order_hash: vector<u8>
    ): Option<ID> {
        if (table::contains(&factory.dst_escrows, order_hash)) {
            option::some(*table::borrow(&factory.dst_escrows, order_hash))
        } else {
            option::none()
        }
    }

    // === Helper Functions ===
    
    fun hash_immutables(immutables: &Immutables): vector<u8> {
        let mut data = vector::empty<u8>();
        
        // Append all immutable fields
        vector::append(&mut data, escrow_v2::get_order_hash(immutables));
        vector::append(&mut data, escrow_v2::get_hashlock(immutables));
        
        // Append addresses as bytes
        let maker_bytes = bcs::to_bytes(&escrow_v2::get_maker(immutables));
        vector::append(&mut data, maker_bytes);
        
        let taker_bytes = bcs::to_bytes(&escrow_v2::get_taker(immutables));
        vector::append(&mut data, taker_bytes);
        
        let token_bytes = bcs::to_bytes(&escrow_v2::get_token(immutables));
        vector::append(&mut data, token_bytes);
        
        // Append amounts as bytes
        let amount = escrow_v2::get_amount(immutables);
        let amount_bytes = bcs::to_bytes(&amount);
        vector::append(&mut data, amount_bytes);
        
        let deposit = escrow_v2::get_safety_deposit(immutables);
        let deposit_bytes = bcs::to_bytes(&deposit);
        vector::append(&mut data, deposit_bytes);
        
        let timelocks = escrow_v2::get_timelocks(immutables);
        let timelock_bytes = bcs::to_bytes(&timelocks);
        vector::append(&mut data, timelock_bytes);
        
        hash::keccak256(&data)
    }
}