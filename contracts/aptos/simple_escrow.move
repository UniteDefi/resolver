module unite_defi::simple_escrow {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::timestamp;
    use aptos_std::hash;

    // Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_INVALID_SECRET: u64 = 2;
    const E_NOT_AUTHORIZED: u64 = 3;
    const E_TOO_EARLY: u64 = 4;
    const E_TOO_LATE: u64 = 5;
    const E_ALREADY_WITHDRAWN: u64 = 6;
    const E_ALREADY_CANCELLED: u64 = 7;
    const E_INSUFFICIENT_SAFETY_DEPOSIT: u64 = 8;

    const SAFETY_DEPOSIT_AMOUNT: u64 = 1000000; // 0.01 APT

    struct SimpleEscrow<phantom CoinType> has key {
        maker: address,
        taker: address,
        token_amount: u64,
        tokens: Coin<CoinType>,
        hashlock: vector<u8>,
        safety_deposit: Coin<AptosCoin>,
        timelock: u64,
        is_withdrawn: bool,
        is_cancelled: bool,
    }

    // Create a simple escrow with basic HTLC functionality
    public entry fun create_escrow<CoinType>(
        creator: &signer,
        maker: address,
        taker: address,
        token_amount: u64,
        hashlock: vector<u8>,
        timelock: u64,
    ) {
        let creator_addr = signer::address_of(creator);
        assert!(!exists<SimpleEscrow<CoinType>>(creator_addr), E_NOT_INITIALIZED);
        assert!(token_amount > 0, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        // Withdraw tokens from creator
        let tokens = coin::withdraw<CoinType>(creator, token_amount);
        
        // Withdraw safety deposit
        let safety_deposit = coin::withdraw<AptosCoin>(creator, SAFETY_DEPOSIT_AMOUNT);
        
        let escrow = SimpleEscrow<CoinType> {
            maker,
            taker,
            token_amount,
            tokens,
            hashlock,
            safety_deposit,
            timelock,
            is_withdrawn: false,
            is_cancelled: false,
        };
        
        move_to(creator, escrow);
    }

    // Withdraw tokens by revealing the secret
    public entry fun withdraw<CoinType>(
        withdrawer: &signer,
        escrow_address: address,
        secret: vector<u8>,
    ) acquires SimpleEscrow {
        let withdrawer_addr = signer::address_of(withdrawer);
        assert!(exists<SimpleEscrow<CoinType>>(escrow_address), E_NOT_INITIALIZED);
        
        let escrow = borrow_global_mut<SimpleEscrow<CoinType>>(escrow_address);
        assert!(!escrow.is_withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.is_cancelled, E_ALREADY_CANCELLED);
        
        // Verify secret
        let secret_hash = hash::sha3_256(secret);
        assert!(secret_hash == escrow.hashlock, E_INVALID_SECRET);
        
        // Check authorization - only taker can withdraw before timelock
        let current_time = timestamp::now_seconds();
        if (current_time < escrow.timelock) {
            assert!(withdrawer_addr == escrow.taker, E_NOT_AUTHORIZED);
        };
        
        escrow.is_withdrawn = true;
        
        // Transfer tokens to maker
        let tokens = coin::extract_all(&mut escrow.tokens);
        coin::deposit(escrow.maker, tokens);
        
        // Return safety deposit to withdrawer
        let safety_deposit = coin::extract_all(&mut escrow.safety_deposit);
        coin::deposit(withdrawer_addr, safety_deposit);
    }

    // Cancel escrow after timelock expires
    public entry fun cancel<CoinType>(
        canceller: &signer,
        escrow_address: address,
    ) acquires SimpleEscrow {
        let canceller_addr = signer::address_of(canceller);
        assert!(exists<SimpleEscrow<CoinType>>(escrow_address), E_NOT_INITIALIZED);
        
        let escrow = borrow_global_mut<SimpleEscrow<CoinType>>(escrow_address);
        assert!(!escrow.is_withdrawn, E_ALREADY_WITHDRAWN);
        assert!(!escrow.is_cancelled, E_ALREADY_CANCELLED);
        
        // Check timelock
        let current_time = timestamp::now_seconds();
        assert!(current_time >= escrow.timelock, E_TOO_EARLY);
        
        escrow.is_cancelled = true;
        
        // Return tokens to taker
        let tokens = coin::extract_all(&mut escrow.tokens);
        coin::deposit(escrow.taker, tokens);
        
        // Return safety deposit to canceller
        let safety_deposit = coin::extract_all(&mut escrow.safety_deposit);
        coin::deposit(canceller_addr, safety_deposit);
    }

    #[view]
    public fun get_escrow_details<CoinType>(escrow_address: address): (
        address, // maker
        address, // taker
        u64,     // token_amount
        vector<u8>, // hashlock
        u64,     // timelock
        bool,    // is_withdrawn
        bool,    // is_cancelled
    ) acquires SimpleEscrow {
        assert!(exists<SimpleEscrow<CoinType>>(escrow_address), E_NOT_INITIALIZED);
        let escrow = borrow_global<SimpleEscrow<CoinType>>(escrow_address);
        
        (
            escrow.maker,
            escrow.taker,
            escrow.token_amount,
            escrow.hashlock,
            escrow.timelock,
            escrow.is_withdrawn,
            escrow.is_cancelled,
        )
    }

    #[view]
    public fun is_escrow_active<CoinType>(escrow_address: address): bool acquires SimpleEscrow {
        if (!exists<SimpleEscrow<CoinType>>(escrow_address)) {
            return false
        };
        
        let escrow = borrow_global<SimpleEscrow<CoinType>>(escrow_address);
        !escrow.is_withdrawn && !escrow.is_cancelled
    }

    #[view]
    public fun can_withdraw<CoinType>(escrow_address: address, withdrawer: address): bool acquires SimpleEscrow {
        if (!exists<SimpleEscrow<CoinType>>(escrow_address)) {
            return false
        };
        
        let escrow = borrow_global<SimpleEscrow<CoinType>>(escrow_address);
        if (escrow.is_withdrawn || escrow.is_cancelled) {
            return false
        };
        
        let current_time = timestamp::now_seconds();
        if (current_time < escrow.timelock) {
            withdrawer == escrow.taker
        } else {
            true // Anyone can withdraw after timelock
        }
    }

    #[view]
    public fun can_cancel<CoinType>(escrow_address: address): bool acquires SimpleEscrow {
        if (!exists<SimpleEscrow<CoinType>>(escrow_address)) {
            return false
        };
        
        let escrow = borrow_global<SimpleEscrow<CoinType>>(escrow_address);
        if (escrow.is_withdrawn || escrow.is_cancelled) {
            return false
        };
        
        let current_time = timestamp::now_seconds();
        current_time >= escrow.timelock
    }
}