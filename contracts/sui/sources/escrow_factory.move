module escrow::escrow_factory {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::clock::Clock;
    use sui::table::{Self, Table};
    use escrow::escrow::{Self, Escrow};
    use std::vector;

    // Error codes
    const E_UNAUTHORIZED: u64 = 0;
    const E_ALREADY_EXISTS: u64 = 1;
    const E_NOT_FOUND: u64 = 2;

    // Factory for creating and managing escrows
    struct EscrowFactory has key {
        id: UID,
        owner: address,
        escrows: Table<vector<u8>, address>, // order_id -> escrow_address
        escrow_count: u64,
        paused: bool,
    }

    // Admin capability
    struct AdminCap has key {
        id: UID,
    }

    // Events
    struct FactoryCreated has copy, drop {
        factory: address,
        owner: address,
    }

    struct EscrowDeployed has copy, drop {
        factory: address,
        escrow: address,
        order_id: vector<u8>,
    }

    // Initialize factory
    fun init(ctx: &mut TxContext) {
        let sender = tx_context::sender(ctx);
        
        let factory = EscrowFactory {
            id: object::new(ctx),
            owner: sender,
            escrows: table::new(ctx),
            escrow_count: 0,
            paused: false,
        };

        let admin_cap = AdminCap {
            id: object::new(ctx),
        };

        event::emit(FactoryCreated {
            factory: object::uid_to_address(&factory.id),
            owner: sender,
        });

        transfer::share_object(factory);
        transfer::transfer(admin_cap, sender);
    }

    // Deploy a new escrow
    public fun deploy_escrow<T>(
        factory: &mut EscrowFactory,
        order_id: vector<u8>,
        src_beneficiary: address,
        src_token: vector<u8>,
        src_amount: u64,
        dst_beneficiary: address,
        dst_token: vector<u8>,
        dst_chain_id: u64,
        hash_lock: vector<u8>,
        time_lock: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!factory.paused, E_UNAUTHORIZED);
        assert!(!table::contains(&factory.escrows, order_id), E_ALREADY_EXISTS);

        let escrow = escrow::create<T>(
            src_beneficiary,
            src_token,
            src_amount,
            dst_beneficiary,
            dst_token,
            dst_chain_id,
            hash_lock,
            time_lock,
            object::uid_to_address(&factory.id),
            clock,
            ctx,
        );

        let escrow_address = object::uid_to_address(&object::uid(&escrow));
        table::add(&mut factory.escrows, order_id, escrow_address);
        factory.escrow_count = factory.escrow_count + 1;

        event::emit(EscrowDeployed {
            factory: object::uid_to_address(&factory.id),
            escrow: escrow_address,
            order_id,
        });

        transfer::share_object(escrow);
    }

    // Admin functions
    public fun pause(factory: &mut EscrowFactory, _cap: &AdminCap) {
        factory.paused = true;
    }

    public fun unpause(factory: &mut EscrowFactory, _cap: &AdminCap) {
        factory.paused = false;
    }

    public fun transfer_ownership(
        factory: &mut EscrowFactory,
        cap: AdminCap,
        new_owner: address,
        ctx: &mut TxContext,
    ) {
        factory.owner = new_owner;
        transfer::transfer(cap, new_owner);
    }

    // View functions
    public fun get_escrow_address(
        factory: &EscrowFactory,
        order_id: vector<u8>,
    ): address {
        assert!(table::contains(&factory.escrows, order_id), E_NOT_FOUND);
        *table::borrow(&factory.escrows, order_id)
    }

    public fun escrow_count(factory: &EscrowFactory): u64 {
        factory.escrow_count
    }

    public fun is_paused(factory: &EscrowFactory): bool {
        factory.paused
    }

    public fun owner(factory: &EscrowFactory): address {
        factory.owner
    }
}