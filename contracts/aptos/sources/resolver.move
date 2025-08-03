module aptos_addr::resolver {
    use std::signer;
    use std::option;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_addr::escrow::{Self, Immutables};
    use aptos_addr::escrow_factory;
    use aptos_addr::limit_order_protocol::{Self, Order};
    use aptos_addr::dutch_auction;
    use aptos_addr::order_hash;
    use aptos_framework::timestamp;

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INVALID_PARAMETERS: u64 = 2;
    const E_ORDER_COMPLETED: u64 = 3;
    const E_INVALID_SRC_AMOUNT: u64 = 4;
    const E_INSUFFICIENT_APPROVAL: u64 = 5;

    struct Resolver has key {
        owner: address,
        factory_addr: address,
        protocol_addr: address,
        
        // Events
        src_escrow_deployed_events: EventHandle<SrcEscrowDeployedEvent>,
        dst_escrow_deployed_events: EventHandle<DstEscrowDeployedEvent>,
        partial_fill_executed_events: EventHandle<PartialFillExecutedEvent>,
        order_filled_events: EventHandle<OrderFilledEvent>,
    }

    struct SrcEscrowDeployedEvent has drop, store {
        escrow_address: address,
        order_hash: vector<u8>,
    }

    struct DstEscrowDeployedEvent has drop, store {
        escrow_address: address,
        order_hash: vector<u8>,
    }

    struct PartialFillExecutedEvent has drop, store {
        escrow_address: address,
        order_hash: vector<u8>,
        partial_amount: u64,
    }

    struct OrderFilledEvent has drop, store {
        order_hash: vector<u8>,
        src_amount: u64,
        dest_amount: u64,
        current_price: u64,
    }

    // Initialize resolver
    entry public fun initialize(
        owner: &signer,
        factory_addr: address,
        protocol_addr: address,
    ) {
        let owner_addr = signer::address_of(owner);
        
        let resolver = Resolver {
            owner: owner_addr,
            factory_addr,
            protocol_addr,
            src_escrow_deployed_events: account::new_event_handle<SrcEscrowDeployedEvent>(owner),
            dst_escrow_deployed_events: account::new_event_handle<DstEscrowDeployedEvent>(owner),
            partial_fill_executed_events: account::new_event_handle<PartialFillExecutedEvent>(owner),
            order_filled_events: account::new_event_handle<OrderFilledEvent>(owner),
        };
        
        move_to(owner, resolver);
    }

    // *** CRITICAL: ENTRY FUNCTION for deploy_dst_partial ***
    entry public fun deploy_dst_partial<CoinType>(
        resolver_signer: &signer,
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        token: address,
        amount: u64,
        safety_deposit: u64,
        timelocks: u64,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        safety_deposit_apt_amount: u64,
    ) acquires Resolver {
        let resolver_addr = signer::address_of(resolver_signer);
        let resolver_data = borrow_global_mut<Resolver>(resolver_addr);
        
        let immutables = escrow::create_immutables(
            order_hash,
            hashlock,
            maker,
            taker,
            token,
            amount,
            safety_deposit,
            timelocks
        );
        
        let safety_deposit_apt = coin::withdraw<AptosCoin>(resolver_signer, safety_deposit_apt_amount);
        let tokens = coin::withdraw<CoinType>(resolver_signer, partial_amount);
        
        // Create destination escrow
        let escrow_addr = escrow_factory::create_dst_escrow_partial<CoinType>(
            resolver_signer, immutables, src_cancellation_timestamp, partial_amount, safety_deposit_apt, resolver_data.factory_addr
        );
        
        // Deposit tokens to escrow
        escrow::deposit_coins<CoinType>(tokens, escrow_addr);
        
        let order_hash_copy = escrow::get_order_hash(&immutables);
        
        event::emit_event(&mut resolver_data.dst_escrow_deployed_events, DstEscrowDeployedEvent {
            escrow_address: escrow_addr,
            order_hash: order_hash_copy,
        });
        
        event::emit_event(&mut resolver_data.partial_fill_executed_events, PartialFillExecutedEvent {
            escrow_address: escrow_addr,
            order_hash: order_hash_copy,
            partial_amount,
        });
    }

    // Deploy source escrow with partial fill
    public fun deploy_src_partial<CoinType>(
        resolver_signer: &signer,
        immutables: Immutables,
        order: Order,
        signature: vector<u8>,
        _amount: u64,
        partial_amount: u64,
        safety_deposit: Coin<AptosCoin>,
        resolver_addr: address,
    ) acquires Resolver {
        let resolver_data = borrow_global_mut<Resolver>(resolver_addr);
        assert!(signer::address_of(resolver_signer) == resolver_data.owner, E_NOT_AUTHORIZED);
        
        // Check if this is first fill for this order
        let order_hash = escrow::get_order_hash(&immutables);
        let existing_escrow = escrow_factory::get_src_escrow_address(order_hash, resolver_data.factory_addr);
        
        let escrow_addr = if (existing_escrow == @0x0) {
            // First resolver - create escrow and fill order
            let escrow_addr = escrow_factory::create_src_escrow_partial_internal<CoinType>(
                resolver_signer, immutables, partial_amount, safety_deposit, resolver_data.factory_addr
            );
            
            // Fill the order through limit order protocol
            let (_actual_making, _actual_taking, _filled_order_hash) = limit_order_protocol::fill_order<CoinType, CoinType>(
                resolver_signer, order, signature, partial_amount, 0, option::some(escrow_addr), resolver_data.protocol_addr
            );
            
            event::emit_event(&mut resolver_data.src_escrow_deployed_events, SrcEscrowDeployedEvent {
                escrow_address: escrow_addr,
                order_hash,
            });
            
            escrow_addr
        } else {
            // Subsequent resolver - add to existing escrow
            let escrow_addr = escrow_factory::create_src_escrow_partial_internal<CoinType>(
                resolver_signer, immutables, partial_amount, safety_deposit, resolver_data.factory_addr
            );
            
            // Fill the order through limit order protocol
            let (_actual_making, _actual_taking, _filled_order_hash) = limit_order_protocol::fill_order<CoinType, CoinType>(
                resolver_signer, order, signature, partial_amount, 0, option::some(escrow_addr), resolver_data.protocol_addr
            );
            
            escrow_addr
        };
        
        event::emit_event(&mut resolver_data.partial_fill_executed_events, PartialFillExecutedEvent {
            escrow_address: escrow_addr,
            order_hash,
            partial_amount,
        });
    }

    // Withdraw from escrow with secret
    public fun withdraw<CoinType>(
        caller: &signer,
        secret: vector<u8>,
        immutables: Immutables,
        escrow_addr: address,
    ) {
        let caller_addr = signer::address_of(caller);
        escrow::withdraw_with_secret<CoinType>(caller_addr, secret, immutables, escrow_addr);
    }

    // Cancel escrow
    public fun cancel<CoinType>(
        caller: &signer,
        immutables: Immutables,
        escrow_addr: address,
    ) {
        let caller_addr = signer::address_of(caller);
        escrow::cancel<CoinType>(caller_addr, immutables, escrow_addr);
    }

    // *** CRITICAL: Fill order with Dutch auction pricing ***
    // This prevents direct deposits and enforces auction pricing
    entry public fun fill_order<CoinType>(
        resolver_signer: &signer,
        // Immutables parameters
        order_hash: vector<u8>,
        hashlock: vector<u8>,
        maker: address,
        taker: address,
        token: address,
        amount: u64,
        safety_deposit: u64,
        timelocks: u64,
        // Order parameters for Dutch auction calculation
        salt: u64,
        maker_asset: vector<u8>,
        taker_asset: vector<u8>,
        making_amount: u64,
        taking_amount: u64,
        deadline: u64,
        nonce: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        auction_start_time: u64,
        auction_end_time: u64,
        start_price: u64,  // Price in Aptos format (6 decimals)
        end_price: u64,    // Price in Aptos format (6 decimals)
        // Additional parameters
        src_cancellation_timestamp: u64,
        src_amount: u64,   // Amount being filled on source chain
        safety_deposit_apt_amount: u64,
        making_decimals: u8,
        taking_decimals: u8,
    ) acquires Resolver {
        let resolver_addr = signer::address_of(resolver_signer);
        let resolver_data = borrow_global_mut<Resolver>(resolver_addr);
        
        assert!(src_amount > 0, E_INVALID_SRC_AMOUNT);
        
        // Verify the order hash matches
        // Convert vector<u8> addresses to Aptos addresses for hashing
        let maker_asset_addr = @0x0; // This should be parsed from maker_asset bytes
        let taker_asset_addr = @0x0; // This should be parsed from taker_asset bytes
        
        let computed_hash = order_hash::hash_order_evm_compatible(
            salt, maker, taker, maker_asset_addr, taker_asset_addr,
            making_amount, taking_amount, deadline, nonce,
            src_chain_id, dst_chain_id, auction_start_time, auction_end_time,
            (start_price * dutch_auction::convert_price_to_evm(1)) / 1,  // Convert to EVM format for hash
            (end_price * dutch_auction::convert_price_to_evm(1)) / 1     // Convert to EVM format for hash
        );
        assert!(computed_hash == order_hash, E_INVALID_PARAMETERS);
        
        // Check if order is already completed
        let is_fully_filled = limit_order_protocol::is_order_fully_filled(order_hash, resolver_data.protocol_addr);
        assert!(!is_fully_filled, E_ORDER_COMPLETED);
        
        // Get remaining amount
        let filled_amount = limit_order_protocol::get_filled_amount(order_hash, resolver_data.protocol_addr);
        let remaining_amount = if (making_amount > filled_amount) {
            making_amount - filled_amount
        } else {
            0
        };
        assert!(src_amount <= remaining_amount, E_INVALID_SRC_AMOUNT);
        
        // Calculate destination amount based on current Dutch auction price
        let dest_amount = dutch_auction::calculate_cross_chain_taking_amount(
            src_amount,
            start_price,
            end_price,
            auction_start_time,
            auction_end_time,
            making_decimals,
            taking_decimals
        );
        
        // Get current price for event
        let current_price = dutch_auction::get_current_price(
            start_price,
            end_price,
            auction_start_time,
            auction_end_time
        );
        
        // Create immutables with destination amount
        let immutables = escrow::create_immutables(
            order_hash,
            hashlock,
            maker,
            taker,
            token,
            dest_amount,  // Use calculated destination amount
            safety_deposit,
            timelocks
        );
        
        // Withdraw safety deposit and tokens
        let safety_deposit_apt = coin::withdraw<AptosCoin>(resolver_signer, safety_deposit_apt_amount);
        let tokens = coin::withdraw<CoinType>(resolver_signer, dest_amount);
        
        // Deploy destination escrow with calculated amount
        let escrow_addr = escrow_factory::create_dst_escrow_partial_for<CoinType>(
            resolver_addr,
            immutables,
            src_cancellation_timestamp,
            dest_amount,
            safety_deposit_apt,
            resolver_data.factory_addr
        );
        
        // Deposit tokens to escrow
        escrow::deposit_coins<CoinType>(tokens, escrow_addr);
        
        // Emit events
        event::emit_event(&mut resolver_data.dst_escrow_deployed_events, DstEscrowDeployedEvent {
            escrow_address: escrow_addr,
            order_hash,
        });
        
        event::emit_event(&mut resolver_data.partial_fill_executed_events, PartialFillExecutedEvent {
            escrow_address: escrow_addr,
            order_hash,
            partial_amount: dest_amount,
        });
        
        event::emit_event(&mut resolver_data.order_filled_events, OrderFilledEvent {
            order_hash,
            src_amount,
            dest_amount,
            current_price,
        });
    }

    // View functions
    #[view]
    public fun get_resolver_info(resolver_addr: address): (address, address, address) acquires Resolver {
        let resolver = borrow_global<Resolver>(resolver_addr);
        (resolver.owner, resolver.factory_addr, resolver.protocol_addr)
    }
}