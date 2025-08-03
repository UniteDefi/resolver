module unite::resolver_v2 {
    use std::option::{Self, Option};
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Clock};
    use sui::bcs;
    
    use unite::escrow_v2::{Self, Escrow, Immutables};
    use unite::escrow_factory_v2::{Self, EscrowFactory, FactoryAdminCap};
    use unite::order_hash::{Self, Order};
    use unite::dutch_auction;
    use unite::limit_order_protocol::{Self, LimitOrderProtocol};

    // === Errors ===
    const EUnauthorized: u64 = 1;
    const EInvalidAmount: u64 = 2;
    const EOrderCompleted: u64 = 3;
    const EInvalidSrcAmount: u64 = 4;
    const EInsufficientApproval: u64 = 5;

    // === Structs ===
    
    /// Resolver state
    public struct Resolver has key, store {
        id: UID,
        owner: address,
        factory_id: ID,
        protocol_id: ID,
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
        factory_id: ID,
        protocol_id: ID,
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

    public struct TokenApproved has copy, drop {
        token: ID,
        amount: u64,
    }

    public struct OrderFilled has copy, drop {
        order_hash: vector<u8>,
        src_amount: u64,
        dest_amount: u64,
        current_price: u256,
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
            factory_id,
            protocol_id,
        };

        let resolver_id = object::id(&resolver);

        let admin_cap = ResolverAdminCap {
            id: object::new(ctx),
            resolver_id,
        };

        event::emit(ResolverCreated {
            resolver_id,
            owner,
            factory_id,
            protocol_id,
        });

        (resolver, admin_cap)
    }

    /// Deploy source escrow with partial fill
    public fun deploy_src_escrow_partial<T>(
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
        assert!(object::id(factory) == resolver.factory_id, EUnauthorized);
        assert!(object::id(protocol) == resolver.protocol_id, EUnauthorized);
        
        let making_amount = (order_hash::get_making_amount(&order) as u64);
        assert!(partial_amount > 0 && partial_amount <= making_amount, EInvalidAmount);
        
        let order_hash = order_hash::hash_order(&order);
        let resolver_address = tx_context::sender(ctx);
        
        // Create immutables
        let immutables = escrow_v2::create_immutables(
            order_hash,
            vector::empty<u8>(), // hashlock will be set later
            order_hash::get_maker(&order),
            @0x0, // taker address (zero for multi-resolver)
            order_hash::get_maker_asset(&order),
            order_hash::get_making_amount(&order),
            (coin::value(&safety_deposit) as u256), // Fixed safety deposit
            encode_timelocks(0, 900, 1800, 3600, 0, 900, 2700), // Standard timelocks
        );
        
        // Create source escrow
        let escrow_id = escrow_factory_v2::create_src_escrow_partial_for<T>(
            factory,
            immutables,
            partial_amount,
            resolver_address,
            safety_deposit,
            clock,
            ctx
        );
        
        // Record the fill in the protocol
        let lop_order = convert_to_lop_order(&order);
        let (actual_making, actual_taking, _) = limit_order_protocol::fill_order(
            protocol,
            lop_order,
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
    public fun deploy_dst_escrow_partial<T>(
        resolver: &Resolver,
        factory: &mut EscrowFactory,
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        total_amount: u64,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        safety_deposit: Coin<SUI>,
        tokens: Coin<T>,
        clock: &Clock,
        _admin_cap: &ResolverAdminCap,
        ctx: &mut TxContext
    ) {
        assert!(object::id(factory) == resolver.factory_id, EUnauthorized);
        assert!(partial_amount > 0 && partial_amount <= total_amount, EInvalidAmount);
        assert!(coin::value(&tokens) >= partial_amount, EInvalidAmount);
        
        let resolver_address = tx_context::sender(ctx);
        
        // Create immutables
        let immutables = escrow_v2::create_immutables(
            order_hash,
            hashlock,
            maker,
            @0x0, // taker
            get_token_address<T>(),
            (total_amount as u256),
            (coin::value(&safety_deposit) as u256),
            encode_timelocks(0, 900, 1800, 3600, 0, 900, 2700),
        );
        
        // Create destination escrow
        let escrow_id = escrow_factory_v2::create_dst_escrow_partial_for<T>(
            factory,
            immutables,
            src_cancellation_timestamp,
            partial_amount,
            resolver_address,
            safety_deposit,
            clock,
            ctx
        );
        
        // Transfer tokens to escrow (this would need to be done in a separate transaction
        // when accessing the shared escrow object)
        // For now, just transfer to resolver
        transfer::public_transfer(tokens, resolver_address);
        
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

    /// Fill order with Dutch auction pricing - resolvers call this instead of deployDstPartial
    public fun fill_order<T>(
        resolver: &Resolver,
        factory: &mut EscrowFactory,
        protocol: &mut LimitOrderProtocol,
        immutables: Immutables,
        order: Order,
        src_cancellation_timestamp: u64,
        src_amount: u64,
        safety_deposit: Coin<SUI>,
        tokens: Coin<T>,
        clock: &Clock,
        _admin_cap: &ResolverAdminCap,
        ctx: &mut TxContext
    ) {
        assert!(src_amount > 0, EInvalidSrcAmount);
        
        let order_hash = order_hash::hash_order(&order);
        
        // Check if order is already completed
        let lop_order = convert_to_lop_order(&order);
        assert!(!limit_order_protocol::is_order_fully_filled(protocol, lop_order), EOrderCompleted);
        
        // Check remaining amount
        let remaining_amount = limit_order_protocol::get_remaining_amount_by_order(protocol, lop_order);
        assert!(src_amount <= remaining_amount, EInvalidSrcAmount);
        
        // Calculate destination amount based on current Dutch auction price
        let dest_amount = dutch_auction::calculate_taking_amount(
            (src_amount as u256),
            order_hash::get_start_price(&order),
            order_hash::get_end_price(&order),
            order_hash::get_auction_start_time(&order),
            order_hash::get_auction_end_time(&order),
            clock
        );
        
        let dest_amount_u64 = (dest_amount as u64);
        assert!(coin::value(&tokens) >= dest_amount_u64, EInvalidAmount);
        
        // Get current price for event
        let current_price = dutch_auction::get_current_price(
            order_hash::get_start_price(&order),
            order_hash::get_end_price(&order),
            order_hash::get_auction_start_time(&order),
            order_hash::get_auction_end_time(&order),
            clock
        );
        
        // Deploy destination escrow with safety deposit
        let resolver_address = tx_context::sender(ctx);
        let escrow_id = escrow_factory_v2::create_dst_escrow_partial_for<T>(
            factory,
            immutables,
            src_cancellation_timestamp,
            dest_amount_u64,
            resolver_address,
            safety_deposit,
            clock,
            ctx
        );
        
        // Transfer tokens (in practice this would be to the escrow)
        transfer::public_transfer(tokens, resolver_address);
        
        // Update fill tracking in LimitOrderProtocol
        limit_order_protocol::update_fill_amount(protocol, lop_order, src_amount);
        
        event::emit(DstEscrowDeployed {
            escrow_id,
            order_hash,
            resolver: resolver_address,
            partial_amount: dest_amount_u64,
        });
        
        event::emit(PartialFillExecuted {
            escrow_id,
            order_hash,
            resolver: resolver_address,
            partial_amount: dest_amount_u64,
        });
        
        event::emit(OrderFilled {
            order_hash,
            src_amount,
            dest_amount: dest_amount_u64,
            current_price,
        });
    }

    /// Withdraw with secret
    public fun withdraw<T>(
        escrow: &mut Escrow<T>,
        secret: vector<u8>,
        immutables: Immutables,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        escrow_v2::withdraw_with_secret(escrow, secret, immutables, clock, ctx);
    }

    /// Cancel escrow
    public fun cancel<T>(
        escrow: &mut Escrow<T>,
        immutables: Immutables,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        escrow_v2::cancel(escrow, immutables, clock, ctx);
    }

    // === Helper Functions ===
    
    fun encode_timelocks(
        src_withdrawal: u32,
        src_public_withdrawal: u32,
        src_cancellation: u32,
        src_public_cancellation: u32,
        dst_withdrawal: u32,
        dst_public_withdrawal: u32,
        dst_cancellation: u32,
    ): u256 {
        let mut timelocks = 0u256;
        timelocks = timelocks | ((src_withdrawal as u256) << 224);
        timelocks = timelocks | ((src_public_withdrawal as u256) << 192);
        timelocks = timelocks | ((src_cancellation as u256) << 160);
        timelocks = timelocks | ((src_public_cancellation as u256) << 128);
        timelocks = timelocks | ((dst_withdrawal as u256) << 96);
        timelocks = timelocks | ((dst_public_withdrawal as u256) << 64);
        timelocks = timelocks | ((dst_cancellation as u256) << 32);
        timelocks
    }
    
    fun convert_to_lop_order(order: &Order): limit_order_protocol::Order {
        // Convert addresses to bytes for asset types
        let maker_asset_bytes = bcs::to_bytes(&order_hash::get_maker_asset(order));
        let taker_asset_bytes = bcs::to_bytes(&order_hash::get_taker_asset(order));
        
        limit_order_protocol::new_order(
            (order_hash::get_salt(order) as u64),
            order_hash::get_maker(order),
            order_hash::get_receiver(order),
            maker_asset_bytes,
            taker_asset_bytes,
            (order_hash::get_making_amount(order) as u64),
            (order_hash::get_taking_amount(order) as u64),
            (order_hash::get_deadline(order) as u64),
            (order_hash::get_nonce(order) as u64),
            (order_hash::get_src_chain_id(order) as u64),
            (order_hash::get_dst_chain_id(order) as u64),
            (order_hash::get_auction_start_time(order) as u64),
            (order_hash::get_auction_end_time(order) as u64),
            (order_hash::get_start_price(order) as u64),
            (order_hash::get_end_price(order) as u64),
        )
    }
    
    fun get_token_address<T>(): address {
        // In a real implementation, this would return the actual token address
        // For now, return a placeholder
        @0x0
    }
}