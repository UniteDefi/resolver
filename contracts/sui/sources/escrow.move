module escrow::escrow {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::{Self, Clock};
    use sui::event;
    use std::option::{Self, Option};

    // Error codes
    const E_NOT_INITIALIZED: u64 = 0;
    const E_ALREADY_INITIALIZED: u64 = 1;
    const E_INSUFFICIENT_AMOUNT: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_INVALID_SECRET: u64 = 4;
    const E_EXPIRED: u64 = 5;
    const E_NOT_EXPIRED: u64 = 6;
    const E_ALREADY_WITHDRAWN: u64 = 7;

    // Escrow states
    const STATE_CREATED: u8 = 0;
    const STATE_FILLED: u8 = 1;
    const STATE_WITHDRAWN: u8 = 2;
    const STATE_REFUNDED: u8 = 3;

    // Escrow object for cross-chain swaps
    struct Escrow<phantom T> has key {
        id: UID,
        // Source chain info
        src_beneficiary: address,
        src_token: vector<u8>,
        src_amount: u64,
        // Destination chain info
        dst_beneficiary: address,
        dst_token: vector<u8>,
        dst_chain_id: u64,
        // HTLC parameters
        hash_lock: vector<u8>,
        time_lock: u64,
        // State
        state: u8,
        balance: Balance<T>,
        // Metadata
        created_at: u64,
        factory: address,
    }

    // Events
    struct EscrowCreated has copy, drop {
        escrow_id: address,
        src_beneficiary: address,
        dst_beneficiary: address,
        amount: u64,
        hash_lock: vector<u8>,
        time_lock: u64,
    }

    struct EscrowFilled has copy, drop {
        escrow_id: address,
        amount: u64,
    }

    struct EscrowWithdrawn has copy, drop {
        escrow_id: address,
        recipient: address,
        secret: vector<u8>,
    }

    struct EscrowRefunded has copy, drop {
        escrow_id: address,
        recipient: address,
    }

    // Create a new escrow
    public fun create<T>(
        src_beneficiary: address,
        src_token: vector<u8>,
        src_amount: u64,
        dst_beneficiary: address,
        dst_token: vector<u8>,
        dst_chain_id: u64,
        hash_lock: vector<u8>,
        time_lock: u64,
        factory: address,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Escrow<T> {
        let escrow = Escrow<T> {
            id: object::new(ctx),
            src_beneficiary,
            src_token,
            src_amount,
            dst_beneficiary,
            dst_token,
            dst_chain_id,
            hash_lock,
            time_lock,
            state: STATE_CREATED,
            balance: balance::zero<T>(),
            created_at: clock::timestamp_ms(clock),
            factory,
        };

        event::emit(EscrowCreated {
            escrow_id: object::uid_to_address(&escrow.id),
            src_beneficiary,
            dst_beneficiary,
            amount: src_amount,
            hash_lock,
            time_lock,
        });

        escrow
    }

    // Fill escrow with tokens
    public fun fill<T>(
        escrow: &mut Escrow<T>,
        payment: Coin<T>,
        ctx: &mut TxContext,
    ) {
        assert!(escrow.state == STATE_CREATED, E_ALREADY_INITIALIZED);
        
        let payment_amount = coin::value(&payment);
        assert!(payment_amount >= escrow.src_amount, E_INSUFFICIENT_AMOUNT);

        // Add payment to escrow balance
        balance::join(&mut escrow.balance, coin::into_balance(payment));
        escrow.state = STATE_FILLED;

        event::emit(EscrowFilled {
            escrow_id: object::uid_to_address(&escrow.id),
            amount: payment_amount,
        });
    }

    // Withdraw funds with valid secret
    public fun withdraw<T>(
        escrow: &mut Escrow<T>,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(escrow.state == STATE_FILLED, E_NOT_INITIALIZED);
        assert!(validate_secret(&escrow.hash_lock, &secret), E_INVALID_SECRET);
        assert!(clock::timestamp_ms(clock) < escrow.time_lock, E_EXPIRED);

        escrow.state = STATE_WITHDRAWN;
        let withdrawn_amount = balance::value(&escrow.balance);
        let withdrawn = coin::from_balance(
            balance::withdraw_all(&mut escrow.balance),
            ctx
        );

        event::emit(EscrowWithdrawn {
            escrow_id: object::uid_to_address(&escrow.id),
            recipient: escrow.dst_beneficiary,
            secret,
        });

        withdrawn
    }

    // Refund after timeout
    public fun refund<T>(
        escrow: &mut Escrow<T>,
        clock: &Clock,
        ctx: &mut TxContext,
    ): Coin<T> {
        assert!(escrow.state == STATE_FILLED, E_NOT_INITIALIZED);
        assert!(clock::timestamp_ms(clock) >= escrow.time_lock, E_NOT_EXPIRED);
        assert!(tx_context::sender(ctx) == escrow.src_beneficiary, E_UNAUTHORIZED);

        escrow.state = STATE_REFUNDED;
        let refunded = coin::from_balance(
            balance::withdraw_all(&mut escrow.balance),
            ctx
        );

        event::emit(EscrowRefunded {
            escrow_id: object::uid_to_address(&escrow.id),
            recipient: escrow.src_beneficiary,
        });

        refunded
    }

    // Helper function to validate secret against hash
    fun validate_secret(hash_lock: &vector<u8>, secret: &vector<u8>): bool {
        // In production, this would compute hash(secret) and compare with hash_lock
        // For now, we do a simple comparison (implement proper hashing later)
        hash_lock == secret
    }

    // Getters
    public fun state<T>(escrow: &Escrow<T>): u8 {
        escrow.state
    }

    public fun balance_amount<T>(escrow: &Escrow<T>): u64 {
        balance::value(&escrow.balance)
    }

    public fun time_lock<T>(escrow: &Escrow<T>): u64 {
        escrow.time_lock
    }

    public fun src_beneficiary<T>(escrow: &Escrow<T>): address {
        escrow.src_beneficiary
    }

    public fun dst_beneficiary<T>(escrow: &Escrow<T>): address {
        escrow.dst_beneficiary
    }
}