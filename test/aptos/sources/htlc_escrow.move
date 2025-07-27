module unite_defi::htlc_escrow {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_std::aptos_hash;
    use unite_defi::events;

    friend unite_defi::escrow_factory;

    const E_NOT_INITIALIZED: u64 = 1;
    const E_INVALID_SECRET: u64 = 2;
    const E_NOT_AUTHORIZED: u64 = 3;
    const E_TOO_EARLY: u64 = 4;
    const E_TOO_LATE: u64 = 5;
    const E_ALREADY_WITHDRAWN: u64 = 6;
    const E_ALREADY_CANCELLED: u64 = 7;
    const E_INSUFFICIENT_SAFETY_DEPOSIT: u64 = 8;

    const SAFETY_DEPOSIT_AMOUNT: u64 = 1000000; // 0.01 APT (8 decimals)

    struct Escrow<phantom CoinType> has key {
        maker: address,
        taker: address,
        token_amount: u64,
        tokens: Coin<CoinType>,
        hashlock: vector<u8>,
        safety_deposit: Coin<AptosCoin>,
        withdrawal_deadline: u64,
        public_withdrawal_deadline: u64,
        cancellation_deadline: u64,
        public_cancellation_deadline: u64,
        is_withdrawn: bool,
        is_cancelled: bool,
        revealed_secret: vector<u8>,
    }

    struct EscrowInfo has store {
        escrow_address: address,
        maker: address,
        taker: address,
        token_amount: u64,
        hashlock: vector<u8>,
        is_active: bool,
    }

    public(friend) fun create_escrow<CoinType>(
        resource_account: &signer,
        maker: address,
        taker: address,
        token_amount: u64,
        tokens: Coin<CoinType>,
        hashlock: vector<u8>,
        safety_deposit: Coin<AptosCoin>,
        withdrawal_deadline: u64,
        public_withdrawal_deadline: u64,
        cancellation_deadline: u64,
        public_cancellation_deadline: u64,
    ): address {
        let resource_addr = signer::address_of(resource_account);
        
        assert!(coin::value(&safety_deposit) >= SAFETY_DEPOSIT_AMOUNT, E_INSUFFICIENT_SAFETY_DEPOSIT);
        assert!(coin::value(&tokens) == token_amount, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        let escrow = Escrow<CoinType> {
            maker,
            taker,
            token_amount,
            tokens,
            hashlock,
            safety_deposit,
            withdrawal_deadline,
            public_withdrawal_deadline,
            cancellation_deadline,
            public_cancellation_deadline,
            is_withdrawn: false,
            is_cancelled: false,
            revealed_secret: vector::empty(),
        };
        
        move_to(resource_account, escrow);
        
        resource_addr
    }

    public entry fun withdraw<CoinType>(
        withdrawer: &signer,
        escrow_address: address,
        secret: vector<u8>,
    ) acquires Escrow {
        let withdrawer_addr = signer::address_of(withdrawer);
        assert!(exists<Escrow<CoinType>>(escrow_address), E_NOT_INITIALIZED);
        
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_address);
        let current_time = timestamp::now_seconds();
        
        assert!(!escrow.is_withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.is_cancelled, E_ALREADY_CANCELLED);
        
        let secret_hash = aptos_hash::sha3_256(secret);
        assert!(secret_hash == escrow.hashlock, E_INVALID_SECRET);
        
        if (current_time <= escrow.withdrawal_deadline) {
            assert!(withdrawer_addr == escrow.taker, E_NOT_AUTHORIZED);
        } else {
            assert!(current_time <= escrow.public_withdrawal_deadline, E_TOO_LATE);
        };
        
        escrow.is_withdrawn = true;
        escrow.revealed_secret = secret;
        
        let tokens = coin::extract_all(&mut escrow.tokens);
        coin::deposit(escrow.maker, tokens);
        
        let safety_deposit = coin::extract_all(&mut escrow.safety_deposit);
        coin::deposit(withdrawer_addr, safety_deposit);
        
        events::emit_escrow_withdrawn(
            escrow_address,
            withdrawer_addr,
            secret,
            escrow.token_amount,
            current_time,
        );
    }

    public entry fun cancel<CoinType>(
        canceller: &signer,
        escrow_address: address,
    ) acquires Escrow {
        let canceller_addr = signer::address_of(canceller);
        assert!(exists<Escrow<CoinType>>(escrow_address), E_NOT_INITIALIZED);
        
        let escrow = borrow_global_mut<Escrow<CoinType>>(escrow_address);
        let current_time = timestamp::now_seconds();
        
        assert!(!escrow.is_withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.is_cancelled, E_ALREADY_CANCELLED);
        
        if (current_time <= escrow.cancellation_deadline) {
            assert!(canceller_addr == escrow.taker, E_NOT_AUTHORIZED);
        } else {
            assert!(current_time > escrow.cancellation_deadline, E_TOO_EARLY);
            assert!(current_time <= escrow.public_cancellation_deadline, E_TOO_LATE);
        };
        
        escrow.is_cancelled = true;
        
        let tokens = coin::extract_all(&mut escrow.tokens);
        coin::deposit(escrow.taker, tokens);
        
        let safety_deposit = coin::extract_all(&mut escrow.safety_deposit);
        coin::deposit(canceller_addr, safety_deposit);
        
        events::emit_escrow_cancelled(
            escrow_address,
            canceller_addr,
            escrow.token_amount,
            current_time,
        );
    }

    #[view]
    public fun get_escrow_details<CoinType>(escrow_address: address): (
        address, // maker
        address, // taker
        u64,     // token_amount
        vector<u8>, // hashlock
        u64,     // withdrawal_deadline
        u64,     // cancellation_deadline
        bool,    // is_withdrawn
        bool,    // is_cancelled
        vector<u8>, // revealed_secret
    ) acquires Escrow {
        assert!(exists<Escrow<CoinType>>(escrow_address), E_NOT_INITIALIZED);
        let escrow = borrow_global<Escrow<CoinType>>(escrow_address);
        
        (
            escrow.maker,
            escrow.taker,
            escrow.token_amount,
            escrow.hashlock,
            escrow.withdrawal_deadline,
            escrow.cancellation_deadline,
            escrow.is_withdrawn,
            escrow.is_cancelled,
            escrow.revealed_secret,
        )
    }

    #[view]
    public fun is_escrow_active<CoinType>(escrow_address: address): bool acquires Escrow {
        if (!exists<Escrow<CoinType>>(escrow_address)) {
            return false
        };
        
        let escrow = borrow_global<Escrow<CoinType>>(escrow_address);
        !escrow.is_withdrawn && !escrow.is_cancelled
    }

    #[view]
    public fun get_revealed_secret<CoinType>(escrow_address: address): vector<u8> acquires Escrow {
        assert!(exists<Escrow<CoinType>>(escrow_address), E_NOT_INITIALIZED);
        let escrow = borrow_global<Escrow<CoinType>>(escrow_address);
        escrow.revealed_secret
    }
}