module unite_resolver::escrow {
    use std::signer;
    use std::vector;
    use aptos_framework::coin;
    use aptos_framework::timestamp;
    use aptos_framework::event;
    
    // Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_INVALID_HASHLOCK: u64 = 2;
    const E_INVALID_TIMELOCK: u64 = 3;
    const E_ALREADY_WITHDRAWN: u64 = 4;
    const E_ALREADY_REFUNDED: u64 = 5;
    const E_NOT_REFUNDABLE: u64 = 6;
    const E_UNAUTHORIZED: u64 = 7;
    const E_INVALID_SECRET: u64 = 8;

    // Escrow states
    const STATE_ACTIVE: u8 = 0;
    const STATE_WITHDRAWN: u8 = 1;
    const STATE_REFUNDED: u8 = 2;

    struct Escrow<phantom CoinType> has key {
        src_address: address,
        dst_address: address,
        src_token: address,
        src_amount: u64,
        hashlock: vector<u8>,
        secret: vector<u8>,
        timelock: u64,
        state: u8,
        escrow_id: vector<u8>,
    }

    struct EscrowEvents has key {
        escrow_created_events: event::EventHandle<EscrowCreatedEvent>,
        escrow_withdrawn_events: event::EventHandle<EscrowWithdrawnEvent>,
        escrow_refunded_events: event::EventHandle<EscrowRefundedEvent>,
    }

    struct EscrowCreatedEvent has drop, store {
        escrow_id: vector<u8>,
        src_address: address,
        dst_address: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
    }

    struct EscrowWithdrawnEvent has drop, store {
        escrow_id: vector<u8>,
        secret: vector<u8>,
        withdrawer: address,
    }

    struct EscrowRefundedEvent has drop, store {
        escrow_id: vector<u8>,
        refunder: address,
    }

    public fun initialize(account: &signer) {
        move_to(account, EscrowEvents {
            escrow_created_events: event::new_event_handle<EscrowCreatedEvent>(account),
            escrow_withdrawn_events: event::new_event_handle<EscrowWithdrawnEvent>(account),
            escrow_refunded_events: event::new_event_handle<EscrowRefundedEvent>(account),
        });
    }

    public entry fun create_escrow<CoinType>(
        src: &signer,
        dst_address: address,
        amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
        escrow_id: vector<u8>,
    ) acquires EscrowEvents {
        let src_address = signer::address_of(src);
        
        // Validate inputs
        assert!(vector::length(&hashlock) == 32, E_INVALID_HASHLOCK);
        assert!(timelock > timestamp::now_seconds(), E_INVALID_TIMELOCK);
        
        // Transfer coins to escrow
        let coins = coin::withdraw<CoinType>(src, amount);
        
        // Create escrow
        let escrow = Escrow<CoinType> {
            src_address,
            dst_address,
            src_token: @0x1, // APT token address
            src_amount: amount,
            hashlock,
            secret: vector::empty(),
            timelock,
            state: STATE_ACTIVE,
            escrow_id,
        };
        
        // Store escrow under a unique address
        move_to(src, escrow);
        
        // Emit event
        let events = borrow_global_mut<EscrowEvents>(@unite_resolver);
        event::emit_event(&mut events.escrow_created_events, EscrowCreatedEvent {
            escrow_id,
            src_address,
            dst_address,
            amount,
            hashlock,
            timelock,
        });
    }

    public entry fun withdraw<CoinType>(
        withdrawer: &signer,
        escrow_holder: address,
        secret: vector<u8>,
    ) acquires Escrow, EscrowEvents {
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_holder);
        
        // Validate withdrawal
        assert!(escrow.state == STATE_ACTIVE, E_ALREADY_WITHDRAWN);
        assert!(signer::address_of(withdrawer) == escrow.dst_address, E_UNAUTHORIZED);
        
        // Verify secret
        let secret_hash = hash::sha3_256(secret);
        assert!(secret_hash == escrow.hashlock, E_INVALID_SECRET);
        
        // Update state
        escrow.state = STATE_WITHDRAWN;
        escrow.secret = secret;
        
        // Transfer coins to withdrawer
        let coins = coin::withdraw<CoinType>(&escrow_holder, escrow.src_amount);
        coin::deposit(signer::address_of(withdrawer), coins);
        
        // Emit event
        let events = borrow_global_mut<EscrowEvents>(@unite_resolver);
        event::emit_event(&mut events.escrow_withdrawn_events, EscrowWithdrawnEvent {
            escrow_id: escrow.escrow_id,
            secret,
            withdrawer: signer::address_of(withdrawer),
        });
    }

    public entry fun refund<CoinType>(
        refunder: &signer,
        escrow_holder: address,
    ) acquires Escrow, EscrowEvents {
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_holder);
        
        // Validate refund
        assert!(escrow.state == STATE_ACTIVE, E_ALREADY_REFUNDED);
        assert!(signer::address_of(refunder) == escrow.src_address, E_UNAUTHORIZED);
        assert!(timestamp::now_seconds() >= escrow.timelock, E_NOT_REFUNDABLE);
        
        // Update state
        escrow.state = STATE_REFUNDED;
        
        // Transfer coins back to source
        let coins = coin::withdraw<CoinType>(&escrow_holder, escrow.src_amount);
        coin::deposit(escrow.src_address, coins);
        
        // Emit event
        let events = borrow_global_mut<EscrowEvents>(@unite_resolver);
        event::emit_event(&mut events.escrow_refunded_events, EscrowRefundedEvent {
            escrow_id: escrow.escrow_id,
            refunder: signer::address_of(refunder),
        });
    }

    #[view]
    public fun get_escrow_details<CoinType>(escrow_holder: address): (address, address, u64, vector<u8>, u64, u8) acquires Escrow {
        let escrow = borrow_global<Escrow<CoinType>>(escrow_holder);
        (
            escrow.src_address,
            escrow.dst_address,
            escrow.src_amount,
            escrow.hashlock,
            escrow.timelock,
            escrow.state
        )
    }
}