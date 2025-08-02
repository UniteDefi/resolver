module aptos_addr::resolver {
    use std::signer;
    use std::option;
    use aptos_framework::coin::{Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_addr::escrow::{Self, Immutables};
    use aptos_addr::escrow_factory;
    use aptos_addr::limit_order_protocol::{Self, Order};

    // Error codes
    const E_NOT_AUTHORIZED: u64 = 1;
    const E_INVALID_PARAMETERS: u64 = 2;

    struct Resolver has key {
        owner: address,
        factory_addr: address,
        protocol_addr: address,
        
        // Events
        src_escrow_deployed_events: EventHandle<SrcEscrowDeployedEvent>,
        dst_escrow_deployed_events: EventHandle<DstEscrowDeployedEvent>,
        partial_fill_executed_events: EventHandle<PartialFillExecutedEvent>,
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
        };
        
        move_to(owner, resolver);
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
            let escrow_addr = escrow_factory::create_src_escrow_partial<CoinType>(
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
            let escrow_addr = escrow_factory::create_src_escrow_partial<CoinType>(
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

    // Deploy destination escrow with partial fill
    public fun deploy_dst_partial<CoinType>(
        resolver_signer: &signer,
        immutables: Immutables,
        src_cancellation_timestamp: u64,
        partial_amount: u64,
        safety_deposit: Coin<AptosCoin>,
        tokens: Coin<CoinType>,
        resolver_addr: address,
    ) acquires Resolver {
        let resolver_data = borrow_global_mut<Resolver>(resolver_addr);
        assert!(signer::address_of(resolver_signer) == resolver_data.owner, E_NOT_AUTHORIZED);
        
        let order_hash = escrow::get_order_hash(&immutables);
        
        // Create destination escrow
        let escrow_addr = escrow_factory::create_dst_escrow_partial<CoinType>(
            resolver_signer, immutables, src_cancellation_timestamp, partial_amount, safety_deposit, resolver_data.factory_addr
        );
        
        // Deposit tokens to escrow
        escrow::deposit_coins<CoinType>(tokens, escrow_addr);
        
        event::emit_event(&mut resolver_data.dst_escrow_deployed_events, DstEscrowDeployedEvent {
            escrow_address: escrow_addr,
            order_hash,
        });
        
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


    // View functions
    #[view]
    public fun get_resolver_info(resolver_addr: address): (address, address, address) acquires Resolver {
        let resolver = borrow_global<Resolver>(resolver_addr);
        (resolver.owner, resolver.factory_addr, resolver.protocol_addr)
    }
}