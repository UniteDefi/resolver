module unite_defi_sui::htlc_correct {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::hash;
    use sui::bcs;
    use std::string::String;
    use std::vector;
    use std::option::{Self, Option};

    // Error constants
    const E_INVALID_SECRET: u64 = 1;
    const E_TIMEOUT_NOT_REACHED: u64 = 2;
    const E_ALREADY_WITHDRAWN: u64 = 3;
    const E_INVALID_HASH: u64 = 4;
    const E_NOT_AUTHORIZED: u64 = 5;
    const E_INVALID_TIMELOCK: u64 = 6;
    const E_NOT_FUNDED: u64 = 7;
    const E_ALREADY_FUNDED: u64 = 8;
    const E_INVALID_MERKLE_PROOF: u64 = 9;
    const E_HTLC_NOT_EXISTS: u64 = 10;
    const E_INVALID_AMOUNT: u64 = 11;
    const E_WRONG_PHASE: u64 = 12;

    // Timelock structure for both HTLCs (packed in EVM, separate fields in Sui)
    struct Timelocks has store, drop, copy {
        finality_time: u64,              // T1: When HTLC becomes active
        src_withdrawal_time: u64,         // T2: When taker can withdraw on source
        src_public_withdrawal_time: u64,  // T3: When anyone can help withdraw on source
        cancellation_time: u64,           // T4: When cancellation period starts
        src_public_cancellation_time: u64,// T5: When anyone can cancel on source
        dst_withdrawal_time: u64,         // T6: When resolver can reveal on destination
        dst_public_withdrawal_time: u64,  // T7: When anyone can help reveal on destination
    }

    // Source HTLC
    struct HTLCSrc has key {
        id: UID,
        order_id: vector<u8>,      // Changed from swap_id String to match EVM bytes32
        maker: address,
        taker: address,
        expected_amount: u64,
        user_funds: Option<Coin<SUI>>,
        safety_deposit: Coin<SUI>,
        secret_hash: vector<u8>,
        timelocks: Timelocks,
        deployed_at: u64,
        funded: bool,
        withdrawn: bool,
        merkle_root: Option<vector<u8>>, // For multi-fill support
        filled_amount: u64,               // Track partial fills
    }

    // Destination HTLC  
    struct HTLCDst has key {
        id: UID,
        order_id: vector<u8>,      // Changed from swap_id String to match EVM bytes32
        maker: address,
        taker: address,
        expected_amount: u64,
        dest_funds: Option<Coin<SUI>>,
        safety_deposit: Coin<SUI>,
        secret_hash: vector<u8>,
        timelocks: Timelocks,
        deployed_at: u64,
        funded: bool,
        withdrawn: bool,
    }

    // Events - matching EVM implementation
    struct HTLCDeployed has copy, drop {
        order_id: vector<u8>,
        maker: address,
        taker: address,
        expected_amount: u64,
        safety_deposit: u64,
        secret_hash: vector<u8>,
        is_src: bool,
    }

    struct HTLCFunded has copy, drop {
        order_id: vector<u8>,
        amount: u64,
        is_src: bool,
    }

    struct HTLCWithdrawn has copy, drop {
        order_id: vector<u8>,
        secret: vector<u8>,
        beneficiary: address,
        amount: u64,
        is_src: bool,
    }

    struct HTLCCancelled has copy, drop {
        order_id: vector<u8>,
        beneficiary: address,
        is_src: bool,
    }

    struct PartialFill has copy, drop {
        order_id: vector<u8>,
        filled_amount: u64,
        remaining_amount: u64,
    }

    // Helper function to validate timelocks
    fun validate_timelocks(timelocks: &Timelocks, current_time: u64) {
        assert!(current_time < timelocks.finality_time, E_INVALID_TIMELOCK);
        assert!(timelocks.finality_time < timelocks.src_withdrawal_time, E_INVALID_TIMELOCK);
        assert!(timelocks.src_withdrawal_time < timelocks.src_public_withdrawal_time, E_INVALID_TIMELOCK);
        assert!(timelocks.src_public_withdrawal_time < timelocks.cancellation_time, E_INVALID_TIMELOCK);
        assert!(timelocks.cancellation_time < timelocks.src_public_cancellation_time, E_INVALID_TIMELOCK);
        assert!(timelocks.dst_withdrawal_time < timelocks.dst_public_withdrawal_time, E_INVALID_TIMELOCK);
    }

    // Step 2: Deploy source HTLC with ONLY safety deposit (called by resolver/taker)
    public entry fun deploy_src(
        order_id: vector<u8>,
        maker: address,
        expected_amount: u64,
        safety_deposit: Coin<SUI>,
        secret_hash: vector<u8>,
        timelocks: Timelocks,
        merkle_root: vector<u8>, // Optional, pass empty vector if not using multi-fill
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let taker = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        let deposit_value = coin::value(&safety_deposit);
        
        // Validate timelocks
        validate_timelocks(&timelocks, current_time);

        let htlc = HTLCSrc {
            id: object::new(ctx),
            order_id,
            maker,
            taker,
            expected_amount,
            user_funds: option::none(),
            safety_deposit,
            secret_hash,
            timelocks,
            deployed_at: current_time,
            funded: false,
            withdrawn: false,
            merkle_root: if (vector::is_empty(&merkle_root)) {
                option::none()
            } else {
                option::some(merkle_root)
            },
            filled_amount: 0,
        };

        event::emit(HTLCDeployed {
            order_id,
            maker,
            taker,
            expected_amount,
            safety_deposit: deposit_value,
            secret_hash,
            is_src: true,
        });

        transfer::share_object(htlc);
    }

    // Step 5: Deploy destination HTLC with ONLY safety deposit (called by resolver/taker)
    public entry fun deploy_dst(
        order_id: vector<u8>,
        maker: address,
        expected_amount: u64,
        safety_deposit: Coin<SUI>,
        secret_hash: vector<u8>,
        timelocks: Timelocks,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let taker = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        let deposit_value = coin::value(&safety_deposit);
        
        // Validate timelocks
        validate_timelocks(&timelocks, current_time);

        let htlc = HTLCDst {
            id: object::new(ctx),
            order_id,
            maker,
            taker,
            expected_amount,
            dest_funds: option::none(),
            safety_deposit,
            secret_hash,
            timelocks,
            deployed_at: current_time,
            funded: false,
            withdrawn: false,
        };

        event::emit(HTLCDeployed {
            order_id,
            maker,
            taker,
            expected_amount,
            safety_deposit: deposit_value,
            secret_hash,
            is_src: false,
        });

        transfer::share_object(htlc);
    }

    // Step 3: Authorized relayer funds source HTLC with user funds from factory
    public entry fun fund_src(
        htlc: &mut HTLCSrc,
        user_funds: Coin<SUI>,
        amount: u64,
        ctx: &mut TxContext
    ) {
        assert!(!htlc.funded, E_ALREADY_FUNDED);
        assert!(coin::value(&user_funds) >= amount, E_INVALID_AMOUNT);
        
        // For partial fills, check against remaining amount
        let remaining = htlc.expected_amount - htlc.filled_amount;
        assert!(amount <= remaining, E_INVALID_AMOUNT);
        
        // Split exact amount if coin has more
        let funding_coin = if (coin::value(&user_funds) == amount) {
            user_funds
        } else {
            let split_coin = coin::split(&mut user_funds, amount, ctx);
            // Return excess to sender
            transfer::public_transfer(user_funds, tx_context::sender(ctx));
            split_coin
        };
        
        // Add to existing funds or create new
        if (option::is_none(&htlc.user_funds)) {
            option::fill(&mut htlc.user_funds, funding_coin);
        } else {
            let existing = option::borrow_mut(&mut htlc.user_funds);
            coin::join(existing, funding_coin);
        };
        
        htlc.filled_amount = htlc.filled_amount + amount;
        
        // Mark as funded when fully filled
        if (htlc.filled_amount == htlc.expected_amount) {
            htlc.funded = true;
        };

        event::emit(HTLCFunded {
            order_id: htlc.order_id,
            amount,
            is_src: true,
        });
        
        if (htlc.filled_amount < htlc.expected_amount) {
            event::emit(PartialFill {
                order_id: htlc.order_id,
                filled_amount: htlc.filled_amount,
                remaining_amount: htlc.expected_amount - htlc.filled_amount,
            });
        };
    }

    // Step 6: Resolver funds destination HTLC with dest funds (after verifying src is funded)
    public entry fun fund_dst(
        htlc: &mut HTLCDst,
        dest_funds: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        assert!(sender == htlc.taker, E_NOT_AUTHORIZED);
        assert!(!htlc.funded, E_ALREADY_FUNDED);
        assert!(coin::value(&dest_funds) == htlc.expected_amount, E_INVALID_AMOUNT);
        
        let amount = coin::value(&dest_funds);
        option::fill(&mut htlc.dest_funds, dest_funds);
        htlc.funded = true;

        event::emit(HTLCFunded {
            order_id: htlc.order_id,
            amount,
            is_src: false,
        });
    }

    // Step 7/8: Withdraw on destination (resolver reveals secret, user gets funds)
    public entry fun withdraw_dst(
        htlc: &mut HTLCDst,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let current_time = clock::timestamp_ms(clock);
        let sender = tx_context::sender(ctx);
        
        assert!(htlc.funded, E_NOT_FUNDED);
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        
        // Check phase - taker priority period or public period
        if (current_time >= htlc.timelocks.dst_withdrawal_time && 
            current_time < htlc.timelocks.dst_public_withdrawal_time) {
            // Taker priority period
            assert!(sender == htlc.taker, E_NOT_AUTHORIZED);
        } else if (current_time >= htlc.timelocks.dst_public_withdrawal_time &&
                   current_time < htlc.timelocks.cancellation_time) {
            // Public withdrawal period - anyone can help
        } else {
            assert!(false, E_WRONG_PHASE);
        };
        
        // Verify secret hash
        let computed_hash = hash::keccak256(&secret);
        assert!(computed_hash == htlc.secret_hash, E_INVALID_HASH);
        
        htlc.withdrawn = true;
        
        // Transfer dest funds to maker (user)
        let funds = option::extract(&mut htlc.dest_funds);
        let funds_amount = coin::value(&funds);
        transfer::public_transfer(funds, htlc.maker);
        
        // Return safety deposit to appropriate party
        let deposit = coin::split(&mut htlc.safety_deposit, coin::value(&htlc.safety_deposit), ctx);
        if (sender == htlc.taker) {
            // Taker gets deposit back
            transfer::public_transfer(deposit, htlc.taker);
        } else {
            // Public helper gets deposit as incentive
            transfer::public_transfer(deposit, sender);
        };
        
        event::emit(HTLCWithdrawn {
            order_id: htlc.order_id,
            secret,
            beneficiary: htlc.maker,
            amount: funds_amount,
            is_src: false,
        });
    }

    // Step 9/10: Withdraw on source (resolver claims with secret)
    public entry fun withdraw_src(
        htlc: &mut HTLCSrc,
        secret: vector<u8>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        assert!(htlc.funded, E_NOT_FUNDED);
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        
        // Check phase - taker priority period or public period
        if (current_time >= htlc.timelocks.src_withdrawal_time && 
            current_time < htlc.timelocks.src_public_withdrawal_time) {
            // Taker priority period
            assert!(sender == htlc.taker, E_NOT_AUTHORIZED);
        } else if (current_time >= htlc.timelocks.src_public_withdrawal_time &&
                   current_time < htlc.timelocks.cancellation_time) {
            // Public withdrawal period - anyone can help
        } else {
            assert!(false, E_WRONG_PHASE);
        };
        
        // Verify secret hash
        let computed_hash = hash::keccak256(&secret);
        assert!(computed_hash == htlc.secret_hash, E_INVALID_HASH);
        
        htlc.withdrawn = true;
        
        // Transfer user funds to taker (resolver)
        let funds = option::extract(&mut htlc.user_funds);
        let funds_amount = coin::value(&funds);
        transfer::public_transfer(funds, htlc.taker);
        
        // Return safety deposit to appropriate party
        let deposit = coin::split(&mut htlc.safety_deposit, coin::value(&htlc.safety_deposit), ctx);
        if (sender == htlc.taker) {
            // Taker gets deposit back
            transfer::public_transfer(deposit, htlc.taker);
        } else {
            // Public helper gets deposit as incentive
            transfer::public_transfer(deposit, sender);
        };
        
        event::emit(HTLCWithdrawn {
            order_id: htlc.order_id,
            secret,
            beneficiary: htlc.taker,
            amount: funds_amount,
            is_src: true,
        });
    }

    // Cancel source HTLC - taker priority or public cancellation
    public entry fun cancel_src(
        htlc: HTLCSrc,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        
        // Check phase - taker priority cancellation or public cancellation
        let is_public_cancel = if (current_time >= htlc.timelocks.cancellation_time && 
            current_time < htlc.timelocks.src_public_cancellation_time) {
            // Taker priority cancellation period
            assert!(sender == htlc.taker, E_NOT_AUTHORIZED);
            false
        } else if (current_time >= htlc.timelocks.src_public_cancellation_time) {
            // Public cancellation period - anyone can help
            true
        } else {
            assert!(false, E_WRONG_PHASE);
            false
        };
        
        let HTLCSrc {
            id,
            order_id,
            maker,
            taker,
            expected_amount: _,
            user_funds,
            safety_deposit,
            secret_hash: _,
            timelocks: _,
            deployed_at: _,
            funded: _,
            withdrawn: _,
            merkle_root: _,
            filled_amount: _,
        } = htlc;
        
        // Return user funds to maker if they exist
        if (option::is_some(&user_funds)) {
            let funds = option::destroy_some(user_funds);
            transfer::public_transfer(funds, maker);
        } else {
            option::destroy_none(user_funds);
        };
        
        // Return safety deposit to appropriate party
        if (is_public_cancel) {
            // Public helper gets deposit as incentive
            transfer::public_transfer(safety_deposit, sender);
        } else {
            // Taker gets deposit back
            transfer::public_transfer(safety_deposit, taker);
        };
        
        event::emit(HTLCCancelled {
            order_id,
            beneficiary: if (is_public_cancel) { sender } else { taker },
            is_src: true,
        });
        
        object::delete(id);
    }

    // Cancel destination HTLC - only taker can cancel
    public entry fun cancel_dst(
        htlc: HTLCDst,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let current_time = clock::timestamp_ms(clock);
        
        assert!(sender == htlc.taker, E_NOT_AUTHORIZED);
        assert!(!htlc.withdrawn, E_ALREADY_WITHDRAWN);
        assert!(current_time >= htlc.timelocks.cancellation_time, E_TIMEOUT_NOT_REACHED);
        
        let HTLCDst {
            id,
            order_id,
            maker: _,
            taker,
            expected_amount: _,
            dest_funds,
            safety_deposit,
            secret_hash: _,
            timelocks: _,
            deployed_at: _,
            funded: _,
            withdrawn: _,
        } = htlc;
        
        // Return dest funds to taker if they exist
        if (option::is_some(&dest_funds)) {
            let funds = option::destroy_some(dest_funds);
            transfer::public_transfer(funds, taker);
        } else {
            option::destroy_none(dest_funds);
        };
        
        // Return safety deposit to taker
        transfer::public_transfer(safety_deposit, taker);
        
        event::emit(HTLCCancelled {
            order_id,
            beneficiary: taker,
            is_src: false,
        });
        
        object::delete(id);
    }

    // Helper function to verify Merkle proof for partial fills
    fun verify_merkle_proof(
        leaf: vector<u8>,
        proof: vector<vector<u8>>,
        root: vector<u8>
    ): bool {
        let current_hash = leaf;
        let i = 0;
        let proof_len = vector::length(&proof);
        
        while (i < proof_len) {
            let sibling = vector::borrow(&proof, i);
            // Combine hashes in sorted order
            let combined = if (compare_bytes(&current_hash, sibling) < 0) {
                let temp = current_hash;
                vector::append(&mut temp, *sibling);
                temp
            } else {
                let temp = *sibling;
                vector::append(&mut temp, current_hash);
                temp
            };
            current_hash = hash::keccak256(&combined);
            i = i + 1;
        };
        
        current_hash == root
    }

    fun compare_bytes(a: &vector<u8>, b: &vector<u8>): u8 {
        let len_a = vector::length(a);
        let len_b = vector::length(b);
        let min_len = if (len_a < len_b) { len_a } else { len_b };
        
        let i = 0;
        while (i < min_len) {
            let byte_a = *vector::borrow(a, i);
            let byte_b = *vector::borrow(b, i);
            if (byte_a < byte_b) {
                return 0
            } else if (byte_a > byte_b) {
                return 2
            };
            i = i + 1;
        };
        
        if (len_a < len_b) { 0 } else if (len_a > len_b) { 2 } else { 1 }
    }

    // Withdraw source with Merkle proof (for partial fills)
    public entry fun withdraw_src_with_proof(
        htlc: &mut HTLCSrc,
        secret: vector<u8>,
        fill_amount: u64,
        proof: vector<vector<u8>>,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        assert!(option::is_some(&htlc.merkle_root), E_INVALID_MERKLE_PROOF);
        
        // Create leaf from fill data
        let leaf_data = htlc.order_id;
        vector::append(&mut leaf_data, bcs::to_bytes(&fill_amount));
        vector::append(&mut leaf_data, secret);
        let leaf = hash::keccak256(&leaf_data);
        
        // Verify Merkle proof
        let root = option::borrow(&htlc.merkle_root);
        assert!(verify_merkle_proof(leaf, proof, *root), E_INVALID_MERKLE_PROOF);
        
        // Process withdrawal for the fill amount
        assert!(fill_amount <= htlc.expected_amount - htlc.filled_amount, E_INVALID_AMOUNT);
        htlc.filled_amount = htlc.filled_amount + fill_amount;
        
        // Continue with normal withdrawal logic
        withdraw_src(htlc, secret, clock, ctx);
    }
}