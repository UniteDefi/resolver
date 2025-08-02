module unite::resolver {
    use std::option;
    use sui::object::{UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Clock};

    use unite::escrow::{Self, SuiEscrow, Timelocks};
    use unite::escrow_factory::{Self, EscrowFactory};
    use unite::limit_order_protocol::{Self, LimitOrderProtocol, Order};

    // === Errors ===
    const EUnauthorized: u64 = 1;
    const EInvalidAmount: u64 = 2;
    const EEscrowNotFound: u64 = 3;

    // === Structs ===
    
    /// Resolver state
    public struct Resolver has key, store {
        id: UID,
        owner: address,
        factory: ID,
        protocol: ID,
    }

    /// Admin capability for resolver
    public struct ResolverAdminCap has key, store {
        id: UID,
        resolver_id: ID,
    }

    // === Events ===
    
    public struct ResolverCreated has copy, drop {
        resolver_id: ID,
        owner: address,
        factory: ID,
        protocol: ID,
    }

    public struct SrcEscrowDeployed has copy, drop {
        escrow_id: ID,
        order_hash: vector<u8>,
        resolver: address,
        partial_amount: u64,
    }

    public struct DstEscrowDeployed has copy, drop {
        escrow_id: ID,
        order_hash: vector<u8>,
        resolver: address,
        partial_amount: u64,
    }

    public struct PartialFillExecuted has copy, drop {
        escrow_id: ID,
        order_hash: vector<u8>,
        resolver: address,
        partial_amount: u64,
    }

    // === Public Functions ===

    /// Create a new resolver
    public fun create_resolver(
        factory_id: ID,
        protocol_id: ID,
        ctx: &mut TxContext
    ): (Resolver, ResolverAdminCap) {
        let owner = tx_context::sender(ctx);
        
        let resolver = Resolver {
            id: object::new(ctx),
            owner,
            factory: factory_id,
            protocol: protocol_id,
        };

        let resolver_id = object::id(&resolver);

        let admin_cap = ResolverAdminCap {
            id: object::new(ctx),
            resolver_id,
        };

        event::emit(ResolverCreated {
            resolver_id,
            owner,
            factory: factory_id,
            protocol: protocol_id,
        });

        (resolver, admin_cap)
    }

    /// Deploy source escrow with partial fill
    public fun deploy_src_escrow_partial(
        resolver: &Resolver,
        factory: &mut EscrowFactory,
        protocol: &mut LimitOrderProtocol,
        order: Order,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        _admin_cap: &ResolverAdminCap,
        ctx: &mut TxContext
    ) {
        assert!(object::id(factory) == resolver.factory, EEscrowNotFound);
        assert!(object::id(protocol) == resolver.protocol, EEscrowNotFound);
        assert!(partial_amount > 0 && partial_amount <= limit_order_protocol::get_making_amount(&order), EInvalidAmount);
        
        let order_hash = limit_order_protocol::hash_order(&order);
        let resolver_address = tx_context::sender(ctx);
        
        // Create timelocks - no time limits for withdrawal with secret
        let timelocks = create_timelocks(
            0,      // src_withdrawal - no limit
            900,    // src_public_withdrawal - 15 min for incentive
            1800,   // src_cancellation - 30 min
            3600,   // src_public_cancellation - 1 hour
            0,      // dst_withdrawal - no limit
            900,    // dst_public_withdrawal - 15 min for incentive
            2700    // dst_cancellation - 45 min
        );
        
        // Calculate total safety deposit for the entire order
        let making_amount = limit_order_protocol::get_making_amount(&order);
        let total_safety_deposit = calculate_proportional_amount(
            making_amount, // total order amount (base for proportion)
            partial_amount,      // partial amount being filled
            coin::value(&safety_deposit) * making_amount / partial_amount // scale up to get total
        );
        
        // Create source escrow
        let escrow_id = escrow_factory::create_src_escrow_partial(
            factory,
            order_hash,
            vector::empty<u8>(), // hashlock will be set later
            limit_order_protocol::get_maker(&order),
            @0x0, // taker address (zero for multi-resolver)
            making_amount,
            total_safety_deposit,
            timelocks,
            partial_amount,
            resolver_address,
            safety_deposit,
            clock,
            ctx
        );
        
        // Record the fill in the protocol
        let (actual_making, actual_taking, _) = limit_order_protocol::fill_order(
            protocol,
            order,
            partial_amount,
            0, // let protocol calculate taking amount
            option::some(escrow_id),
            clock,
            ctx
        );
        
        event::emit(SrcEscrowDeployed {
            escrow_id,
            order_hash,
            resolver: resolver_address,
            partial_amount: actual_making,
        });
        
        event::emit(PartialFillExecuted {
            escrow_id,
            order_hash,
            resolver: resolver_address,
            partial_amount: actual_making,
        });
    }

    /// Deploy destination escrow with partial fill
    public fun deploy_dst_escrow_partial(
        resolver: &Resolver,
        factory: &mut EscrowFactory,
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        total_amount: u64,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        clock: &Clock,
        _admin_cap: &ResolverAdminCap,
        ctx: &mut TxContext
    ) {
        assert!(object::id(factory) == resolver.factory, EEscrowNotFound);
        assert!(partial_amount > 0 && partial_amount <= total_amount, EInvalidAmount);
        
        let resolver_address = tx_context::sender(ctx);
        
        // Create timelocks
        let timelocks = create_timelocks(
            0,      // src_withdrawal
            900,    // src_public_withdrawal
            1800,   // src_cancellation
            3600,   // src_public_cancellation
            0,      // dst_withdrawal - no limit
            900,    // dst_public_withdrawal - 15 min for incentive
            2700    // dst_cancellation - 45 min
        );
        
        // Calculate total safety deposit
        let total_safety_deposit = calculate_proportional_amount(
            total_amount,
            partial_amount,
            coin::value(&safety_deposit) * total_amount / partial_amount
        );
        
        // Create destination escrow
        let escrow_id = escrow_factory::create_dst_escrow_partial(
            factory,
            order_hash,
            hashlock,
            maker,
            @0x0, // taker address
            total_amount,
            total_safety_deposit,
            timelocks,
            src_cancellation_timestamp,
            partial_amount,
            resolver_address,
            safety_deposit,
            clock,
            ctx
        );
        
        event::emit(DstEscrowDeployed {
            escrow_id,
            order_hash,
            resolver: resolver_address,
            partial_amount,
        });
        
        event::emit(PartialFillExecuted {
            escrow_id,
            order_hash,
            resolver: resolver_address,
            partial_amount,
        });
    }

    /// Deposit tokens into destination escrow
    public fun deposit_tokens_to_escrow(
        escrow: &mut SuiEscrow,
        tokens: Coin<SUI>,
        _admin_cap: &ResolverAdminCap,
        ctx: &mut TxContext
    ) {
        escrow::deposit_sui_tokens(escrow, tokens, ctx);
    }

    /// Withdraw from escrow with secret
    public fun withdraw_with_secret(
        escrow: &mut SuiEscrow,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        escrow::withdraw_sui_with_secret(escrow, secret, clock, ctx);
    }

    /// Cancel escrow
    public fun cancel_escrow(
        escrow: &mut SuiEscrow,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        escrow::cancel_sui_escrow(escrow, clock, ctx);
    }

    // === Helper Functions ===
    
    fun create_timelocks(
        src_withdrawal: u32,
        src_public_withdrawal: u32,
        src_cancellation: u32,
        src_public_cancellation: u32,
        dst_withdrawal: u32,
        dst_public_withdrawal: u32,
        dst_cancellation: u32,
    ): Timelocks {
        escrow::create_timelocks(
            0, // deployed_at will be set by escrow
            src_withdrawal,
            src_public_withdrawal,
            src_cancellation,
            src_public_cancellation,
            dst_withdrawal,
            dst_public_withdrawal,
            dst_cancellation,
        )
    }
    
    fun calculate_proportional_amount(total: u64, partial: u64, base_amount: u64): u64 {
        (base_amount * partial) / total
    }

    // === View Functions ===
    
    public fun get_resolver_info(resolver: &Resolver): (address, ID, ID) {
        (resolver.owner, resolver.factory, resolver.protocol)
    }
    
    public fun get_resolver_owner(resolver: &Resolver): address {
        resolver.owner
    }
    
    public fun get_resolver_factory(resolver: &Resolver): ID {
        resolver.factory
    }
    
    public fun get_resolver_protocol(resolver: &Resolver): ID {
        resolver.protocol
    }
}