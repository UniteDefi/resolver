module unite_defi::events {
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::account;

    friend unite_defi::escrow_factory;
    friend unite_defi::htlc_escrow;

    struct CrossChainEventStore has key {
        escrow_created_events: EventHandle<EscrowCreatedEvent>,
        escrow_withdrawn_events: EventHandle<EscrowWithdrawnEvent>,
        escrow_cancelled_events: EventHandle<EscrowCancelledEvent>,
        resolver_locked_events: EventHandle<ResolverLockedEvent>,
    }

    struct EscrowCreatedEvent has drop, store {
        escrow_address: address,
        maker: address,
        taker: address,
        token_amount: u64,
        hashlock: vector<u8>,
        safety_deposit: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        timestamp: u64,
    }

    struct EscrowWithdrawnEvent has drop, store {
        escrow_address: address,
        withdrawer: address,
        secret: vector<u8>,
        token_amount: u64,
        timestamp: u64,
    }

    struct EscrowCancelledEvent has drop, store {
        escrow_address: address,
        canceller: address,
        token_amount: u64,
        timestamp: u64,
    }

    struct ResolverLockedEvent has drop, store {
        auction_id: u64,
        resolver: address,
        escrow_src: address,
        escrow_dst: address,
        timestamp: u64,
    }

    public fun initialize(account: &signer) {
        let event_store = CrossChainEventStore {
            escrow_created_events: account::new_event_handle<EscrowCreatedEvent>(account),
            escrow_withdrawn_events: account::new_event_handle<EscrowWithdrawnEvent>(account),
            escrow_cancelled_events: account::new_event_handle<EscrowCancelledEvent>(account),
            resolver_locked_events: account::new_event_handle<ResolverLockedEvent>(account),
        };
        move_to(account, event_store);
    }

    public(friend) fun emit_escrow_created(
        escrow_address: address,
        maker: address,
        taker: address,
        token_amount: u64,
        hashlock: vector<u8>,
        safety_deposit: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        timestamp: u64,
    ) acquires CrossChainEventStore {
        let event_store = borrow_global_mut<CrossChainEventStore>(@unite_defi);
        event::emit_event(&mut event_store.escrow_created_events, EscrowCreatedEvent {
            escrow_address,
            maker,
            taker,
            token_amount,
            hashlock,
            safety_deposit,
            src_chain_id,
            dst_chain_id,
            timestamp,
        });
    }

    public(friend) fun emit_escrow_withdrawn(
        escrow_address: address,
        withdrawer: address,
        secret: vector<u8>,
        token_amount: u64,
        timestamp: u64,
    ) acquires CrossChainEventStore {
        let event_store = borrow_global_mut<CrossChainEventStore>(@unite_defi);
        event::emit_event(&mut event_store.escrow_withdrawn_events, EscrowWithdrawnEvent {
            escrow_address,
            withdrawer,
            secret,
            token_amount,
            timestamp,
        });
    }

    public(friend) fun emit_escrow_cancelled(
        escrow_address: address,
        canceller: address,
        token_amount: u64,
        timestamp: u64,
    ) acquires CrossChainEventStore {
        let event_store = borrow_global_mut<CrossChainEventStore>(@unite_defi);
        event::emit_event(&mut event_store.escrow_cancelled_events, EscrowCancelledEvent {
            escrow_address,
            canceller,
            token_amount,
            timestamp,
        });
    }

    public(friend) fun emit_resolver_locked(
        auction_id: u64,
        resolver: address,
        escrow_src: address,
        escrow_dst: address,
        timestamp: u64,
    ) acquires CrossChainEventStore {
        let event_store = borrow_global_mut<CrossChainEventStore>(@unite_defi);
        event::emit_event(&mut event_store.resolver_locked_events, ResolverLockedEvent {
            auction_id,
            resolver,
            escrow_src,
            escrow_dst,
            timestamp,
        });
    }
}