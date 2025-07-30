// This module is replaced by htlc_correct.move which implements the complete EVM-compatible flow
// Keeping this file for reference but it should not be used
module unite_defi_sui::htlc_src_deprecated {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::hash;
    use std::string::String;
    use std::vector;

    // Constants
    const E_INVALID_SECRET: u64 = 1;
    const E_TIMEOUT_NOT_REACHED: u64 = 2;
    const E_ALREADY_WITHDRAWN: u64 = 3;
    const E_INVALID_HASH: u64 = 4;
    const E_NOT_AUTHORIZED: u64 = 5;
    const E_INVALID_TIMELOCK: u64 = 6;

    // Structs
    struct HTLCSrc has key {
        id: UID,
        swap_id: String,
        maker: address,
        taker: address,
        amount: Coin<SUI>,
        safety_deposit: Coin<SUI>,
        secret_hash: vector<u8>,
        finality_time: u64,
        withdrawal_time: u64,
        cancellation_time: u64,
        public_withdrawal_time: u64,
        public_cancellation_time: u64,
        withdrawn: bool,
    }

    // Events
    struct HTLCCreated has copy, drop {
        swap_id: String,
        maker: address,
        taker: address,
        amount: u64,
        safety_deposit: u64,
        secret_hash: vector<u8>,
    }

    struct EscrowWithdrawal has copy, drop {
        swap_id: String,
        secret: vector<u8>,
        taker: address,
    }

    struct EscrowCancelled has copy, drop {
        swap_id: String,
        maker: address,
    }

    // Deploy source HTLC (called by resolver/taker with funds + safety deposit)
    public entry fun deploy_src(
        swap_id: String,
        maker: address,
        user_funds: Coin<SUI>,
        safety_deposit: Coin<SUI>,
        secret_hash: vector<u8>,
        finality_time: u64,
        withdrawal_time: u64,
        cancellation_time: u64,
        public_withdrawal_time: u64,
        public_cancellation_time: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let taker = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        // Validate timelocks
        assert!(finality_time < withdrawal_time, E_INVALID_TIMELOCK);
        assert!(withdrawal_time < public_withdrawal_time, E_INVALID_TIMELOCK);
        assert!(public_withdrawal_time < cancellation_time, E_INVALID_TIMELOCK);
        assert!(cancellation_time < public_cancellation_time, E_INVALID_TIMELOCK);
        assert!(current_time < finality_time, E_INVALID_TIMELOCK);

        let amount_value = coin::value(&user_funds);
        let deposit_value = coin::value(&safety_deposit);

        let htlc = HTLCSrc {
            id: object::new(ctx),
            swap_id,
            maker,
            taker,
            amount: user_funds,
            safety_deposit,
            secret_hash,
            finality_time,
            withdrawal_time,
            cancellation_time,
            public_withdrawal_time,
            public_cancellation_time,
            withdrawn: false,
        };

        event::emit(HTLCCreated {
            swap_id,
            maker,
            taker,
            amount: amount_value,
            safety_deposit: deposit_value,
            secret_hash,
        });

        transfer::share_object(htlc);
    }

    // Withdraw by taker with secret (private withdrawal period)
    public entry fun withdraw(
        htlc: &mut HTLCSrc,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        assert!(sender == htlc.taker, E_NOT_AUTHORIZED);
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(current_time >= htlc.withdrawal_time, E_TIMEOUT_NOT_REACHED);
        assert!(current_time < htlc.cancellation_time, E_TIMEOUT_NOT_REACHED);
        
        // Verify secret hash
        let computed_hash = hash::keccak256(&secret);
        assert!(computed_hash == htlc.secret_hash, E_INVALID_HASH);
        
        htlc.withdrawn = true;
        
        // Transfer amount to taker
        let amount = coin::split(&mut htlc.amount, coin::value(&htlc.amount), ctx);
        transfer::public_transfer(amount, htlc.taker);
        
        // Return safety deposit to taker
        let deposit = coin::split(&mut htlc.safety_deposit, coin::value(&htlc.safety_deposit), ctx);
        transfer::public_transfer(deposit, htlc.taker);
        
        event::emit(EscrowWithdrawal {
            swap_id: htlc.swap_id,
            secret,
            taker: htlc.taker,
        });
    }

    // Withdraw to specific address (private withdrawal period)
    public entry fun withdraw_to(
        htlc: &mut HTLCSrc,
        secret: vector<u8>,
        target: address,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        assert!(sender == htlc.taker, E_NOT_AUTHORIZED);
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(current_time >= htlc.withdrawal_time, E_TIMEOUT_NOT_REACHED);
        assert!(current_time < htlc.cancellation_time, E_TIMEOUT_NOT_REACHED);
        
        // Verify secret hash
        let computed_hash = hash::keccak256(&secret);
        assert!(computed_hash == htlc.secret_hash, E_INVALID_HASH);
        
        htlc.withdrawn = true;
        
        // Transfer amount to target
        let amount = coin::split(&mut htlc.amount, coin::value(&htlc.amount), ctx);
        transfer::public_transfer(amount, target);
        
        // Return safety deposit to sender
        let deposit = coin::split(&mut htlc.safety_deposit, coin::value(&htlc.safety_deposit), ctx);
        transfer::public_transfer(deposit, sender);
        
        event::emit(EscrowWithdrawal {
            swap_id: htlc.swap_id,
            secret,
            taker: target,
        });
    }

    // Public withdrawal (anyone can trigger)
    public entry fun public_withdraw(
        htlc: &mut HTLCSrc,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let current_time = clock::timestamp_ms(clock);
        
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(current_time >= htlc.public_withdrawal_time, E_TIMEOUT_NOT_REACHED);
        assert!(current_time < htlc.cancellation_time, E_TIMEOUT_NOT_REACHED);
        
        // Verify secret hash
        let computed_hash = hash::keccak256(&secret);
        assert!(computed_hash == htlc.secret_hash, E_INVALID_HASH);
        
        htlc.withdrawn = true;
        
        // Transfer amount to taker
        let amount = coin::split(&mut htlc.amount, coin::value(&htlc.amount), ctx);
        transfer::public_transfer(amount, htlc.taker);
        
        // Return safety deposit to caller as incentive
        let deposit = coin::split(&mut htlc.safety_deposit, coin::value(&htlc.safety_deposit), ctx);
        transfer::public_transfer(deposit, tx_context::sender(ctx));
        
        event::emit(EscrowWithdrawal {
            swap_id: htlc.swap_id,
            secret,
            taker: htlc.taker,
        });
    }

    // Cancel by taker (private cancellation period)
    public entry fun cancel(
        htlc: HTLCSrc,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        assert!(sender == htlc.taker, E_NOT_AUTHORIZED);
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(current_time >= htlc.cancellation_time, E_TIMEOUT_NOT_REACHED);
        
        let HTLCSrc {
            id,
            swap_id,
            maker,
            taker: _,
            amount,
            safety_deposit,
            secret_hash: _,
            finality_time: _,
            withdrawal_time: _,
            cancellation_time: _,
            public_withdrawal_time: _,
            public_cancellation_time: _,
            withdrawn: _,
        } = htlc;
        
        // Return amount to maker
        transfer::public_transfer(amount, maker);
        
        // Return safety deposit to taker
        transfer::public_transfer(safety_deposit, sender);
        
        event::emit(EscrowCancelled {
            swap_id,
            maker,
        });
        
        object::delete(id);
    }

    // Public cancel (anyone can trigger)
    public entry fun public_cancel(
        htlc: HTLCSrc,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let current_time = clock::timestamp_ms(clock);
        
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(current_time >= htlc.public_cancellation_time, E_TIMEOUT_NOT_REACHED);
        
        let HTLCSrc {
            id,
            swap_id,
            maker,
            taker: _,
            amount,
            safety_deposit,
            secret_hash: _,
            finality_time: _,
            withdrawal_time: _,
            cancellation_time: _,
            public_withdrawal_time: _,
            public_cancellation_time: _,
            withdrawn: _,
        } = htlc;
        
        // Return amount to maker
        transfer::public_transfer(amount, maker);
        
        // Return safety deposit to caller as incentive
        transfer::public_transfer(safety_deposit, tx_context::sender(ctx));
        
        event::emit(EscrowCancelled {
            swap_id,
            maker,
        });
        
        object::delete(id);
    }
}