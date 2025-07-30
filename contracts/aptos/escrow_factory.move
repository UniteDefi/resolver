module unite_defi::escrow_factory {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::aptos_coin::AptosCoin;
    use aptos_framework::account::{Self, SignerCapability};
    use aptos_framework::timestamp;
    use aptos_std::table::{Self, Table};
    use aptos_std::hash;
    use std::bcs;
    use unite_defi::events;
    use unite_defi::htlc_escrow;

    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_AUTHORIZED_RELAYER: u64 = 3;
    const E_INSUFFICIENT_ALLOWANCE: u64 = 4;
    const E_INSUFFICIENT_SAFETY_DEPOSIT: u64 = 5;
    const E_ORDER_NOT_FOUND: u64 = 6;
    const E_ESCROW_ALREADY_EXISTS: u64 = 7;
    const E_INVALID_ORDER_STATE: u64 = 8;
    const E_NOT_RELAYER: u64 = 9;

    const SAFETY_DEPOSIT_AMOUNT: u64 = 1000000; // 0.01 APT

    struct EscrowFactory has key {
        signer_cap: SignerCapability,
        escrow_counter: u64,
        escrows: Table<vector<u8>, EscrowRecord>,
        orders: Table<vector<u8>, Order>,
        authorized_relayers: Table<address, bool>,
        resolver_deposits: Table<address, ResolverDeposit>,
    }

    struct EscrowRecord has store {
        escrow_address: address,
        maker: address,
        taker: address,
        token_amount: u64,
        order_id: vector<u8>,
        created_at: u64,
    }

    struct Order has store {
        order_id: vector<u8>,
        user: address,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        committed_resolver: address,
        src_escrow: address,
        dst_escrow: address,
        secret_hash: vector<u8>,
        created_at: u64,
        state: u8, // 0: created, 1: committed, 2: escrows_deployed, 3: completed
    }

    struct ResolverDeposit has store {
        amount: u64,
        locked_for_order: vector<u8>, // empty if not locked
    }

    struct TokenAllowance<phantom CoinType> has key {
        allowances: Table<address, u64>,
    }

    public entry fun initialize(deployer: &signer) {
        let deployer_addr = signer::address_of(deployer);
        assert!(!exists<EscrowFactory>(deployer_addr), E_ALREADY_INITIALIZED);
        
        let (_resource_account, signer_cap) = account::create_resource_account(
            deployer,
            b"escrow_factory_v1"
        );
        
        let factory = EscrowFactory {
            signer_cap,
            escrow_counter: 0,
            escrows: table::new(),
            orders: table::new(),
            authorized_relayers: table::new(),
            resolver_deposits: table::new(),
        };
        
        move_to(deployer, factory);
    }

    public entry fun authorize_relayer(
        admin: &signer,
        relayer: address,
    ) acquires EscrowFactory {
        let admin_addr = signer::address_of(admin);
        assert!(exists<EscrowFactory>(admin_addr), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<EscrowFactory>(admin_addr);
        table::upsert(&mut factory.authorized_relayers, relayer, true);
    }

    public entry fun revoke_relayer(
        admin: &signer,
        relayer: address,
    ) acquires EscrowFactory {
        let admin_addr = signer::address_of(admin);
        assert!(exists<EscrowFactory>(admin_addr), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<EscrowFactory>(admin_addr);
        if (table::contains(&factory.authorized_relayers, relayer)) {
            table::remove(&mut factory.authorized_relayers, relayer);
        };
    }

    public entry fun approve_tokens<CoinType>(
        user: &signer,
        amount: u64,
    ) acquires TokenAllowance {
        let user_addr = signer::address_of(user);
        
        if (!exists<TokenAllowance<CoinType>>(user_addr)) {
            let allowance = TokenAllowance<CoinType> {
                allowances: table::new(),
            };
            move_to(user, allowance);
        };
        
        let allowance = borrow_global_mut<TokenAllowance<CoinType>>(user_addr);
        if (table::contains(&allowance.allowances, @unite_defi)) {
            let current = table::borrow_mut(&mut allowance.allowances, @unite_defi);
            *current = *current + amount;
        } else {
            table::add(&mut allowance.allowances, @unite_defi, amount);
        };
    }

    public entry fun register_order(
        relayer: &signer,
        order_id: vector<u8>,
        user: address,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
    ) acquires EscrowFactory {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<EscrowFactory>(@unite_defi);
        assert!(table::contains(&factory.authorized_relayers, relayer_addr), E_NOT_AUTHORIZED_RELAYER);
        assert!(!table::contains(&factory.orders, order_id), E_ESCROW_ALREADY_EXISTS);
        
        let order = Order {
            order_id: order_id,
            user,
            src_amount,
            dst_amount,
            src_chain_id,
            dst_chain_id,
            committed_resolver: @0x0,
            src_escrow: @0x0,
            dst_escrow: @0x0,
            secret_hash: vector::empty(),
            created_at: timestamp::now_seconds(),
            state: 0, // created
        };
        
        table::add(&mut factory.orders, order_id, order);
    }

    public entry fun deposit_safety_funds(
        resolver: &signer,
        amount: u64,
    ) acquires EscrowFactory {
        let resolver_addr = signer::address_of(resolver);
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        assert!(amount >= SAFETY_DEPOSIT_AMOUNT, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        let deposit = coin::withdraw<AptosCoin>(resolver, amount);
        
        let factory = borrow_global_mut<EscrowFactory>(@unite_defi);
        let resource_signer = account::create_signer_with_capability(&factory.signer_cap);
        coin::deposit(signer::address_of(&resource_signer), deposit);
        
        if (!table::contains(&factory.resolver_deposits, resolver_addr)) {
            let resolver_deposit = ResolverDeposit {
                amount,
                locked_for_order: vector::empty(),
            };
            table::add(&mut factory.resolver_deposits, resolver_addr, resolver_deposit);
        } else {
            let existing = table::borrow_mut(&mut factory.resolver_deposits, resolver_addr);
            existing.amount = existing.amount + amount;
        };
    }

    public entry fun commit_to_order(
        resolver: &signer,
        order_id: vector<u8>,
    ) acquires EscrowFactory {
        let resolver_addr = signer::address_of(resolver);
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<EscrowFactory>(@unite_defi);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        assert!(table::contains(&factory.resolver_deposits, resolver_addr), E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        let order = table::borrow_mut(&mut factory.orders, order_id);
        assert!(order.state == 0, E_INVALID_ORDER_STATE); // must be created
        
        let resolver_deposit = table::borrow_mut(&mut factory.resolver_deposits, resolver_addr);
        assert!(vector::is_empty(&resolver_deposit.locked_for_order), E_INVALID_ORDER_STATE);
        assert!(resolver_deposit.amount >= SAFETY_DEPOSIT_AMOUNT, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        resolver_deposit.locked_for_order = order_id;
        order.committed_resolver = resolver_addr;
        order.state = 1; // committed
    }

    public entry fun create_escrow_and_transfer_funds<CoinType>(
        relayer: &signer,
        order_id: vector<u8>,
        maker: address,
        taker: address,
        token_amount: u64,
        hashlock: vector<u8>,
        withdrawal_deadline: u64,
        public_withdrawal_deadline: u64,
        cancellation_deadline: u64,
        public_cancellation_deadline: u64,
        is_source: bool,
    ) acquires EscrowFactory, TokenAllowance {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<EscrowFactory>(@unite_defi);
        assert!(table::contains(&factory.authorized_relayers, relayer_addr), E_NOT_AUTHORIZED_RELAYER);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        
        let order = table::borrow_mut(&mut factory.orders, order_id);
        assert!(order.state == 1, E_INVALID_ORDER_STATE); // must be committed
        
        // Generate escrow key
        let escrow_key = generate_escrow_key(
            maker,
            taker,
            token_amount,
            &hashlock,
            is_source
        );
        
        assert!(!table::contains(&factory.escrows, escrow_key), E_ESCROW_ALREADY_EXISTS);
        
        // Get resolver's safety deposit
        let resolver_addr = order.committed_resolver;
        let safety_deposit = {
            let resource_signer = account::create_signer_with_capability(&factory.signer_cap);
            coin::withdraw<AptosCoin>(&resource_signer, SAFETY_DEPOSIT_AMOUNT)
        };
        
        // Withdraw tokens from user's pre-approved allowance
        let tokens = if (is_source) {
            withdraw_from_allowance<CoinType>(order.user, token_amount)
        } else {
            // For destination escrow, resolver should have already deposited tokens
            let resource_signer = account::create_signer_with_capability(&factory.signer_cap);
            coin::withdraw<CoinType>(&resource_signer, token_amount)
        };
        
        // Create escrow account
        let resource_signer = account::create_signer_with_capability(&factory.signer_cap);
        let escrow_seed = vector::empty<u8>();
        vector::append(&mut escrow_seed, b"escrow_");
        vector::append(&mut escrow_seed, escrow_key);
        
        let (escrow_resource, _escrow_cap) = account::create_resource_account(
            &resource_signer,
            escrow_seed
        );
        
        let escrow_address = signer::address_of(&escrow_resource);
        
        // Create HTLC escrow
        htlc_escrow::create_escrow<CoinType>(
            &escrow_resource,
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
        );
        
        let escrow_record = EscrowRecord {
            escrow_address,
            maker,
            taker,
            token_amount,
            order_id: order_id,
            created_at: timestamp::now_seconds(),
        };
        
        table::add(&mut factory.escrows, escrow_key, escrow_record);
        
        // Update order with escrow addresses
        if (is_source) {
            order.src_escrow = escrow_address;
        } else {
            order.dst_escrow = escrow_address;
        };
        
        // Update secret hash if provided
        if (!vector::is_empty(&hashlock)) {
            order.secret_hash = hashlock;
        };
        
        // Update state if both escrows are deployed
        if (order.src_escrow != @0x0 && order.dst_escrow != @0x0) {
            order.state = 2; // escrows_deployed
        };
        
        events::emit_escrow_created(
            escrow_address,
            maker,
            taker,
            token_amount,
            hashlock,
            SAFETY_DEPOSIT_AMOUNT,
            if (is_source) { order.src_chain_id } else { order.dst_chain_id },
            if (is_source) { order.dst_chain_id } else { order.src_chain_id },
            timestamp::now_seconds(),
        );
        
        factory.escrow_counter = factory.escrow_counter + 1;
    }

    fun withdraw_from_allowance<CoinType>(
        owner: address,
        amount: u64,
    ): Coin<CoinType> acquires TokenAllowance {
        assert!(exists<TokenAllowance<CoinType>>(owner), E_INSUFFICIENT_ALLOWANCE);
        
        let allowance = borrow_global_mut<TokenAllowance<CoinType>>(owner);
        assert!(table::contains(&allowance.allowances, @unite_defi), E_INSUFFICIENT_ALLOWANCE);
        
        let approved_amount = table::borrow_mut(&mut allowance.allowances, @unite_defi);
        assert!(*approved_amount >= amount, E_INSUFFICIENT_ALLOWANCE);
        
        *approved_amount = *approved_amount - amount;
        
        // In real implementation, this would withdraw from user's account
        // For now, we assume the tokens are held by the user
        coin::zero<CoinType>()
    }

    public entry fun complete_order(
        relayer: &signer,
        order_id: vector<u8>,
        secret: vector<u8>,
    ) acquires EscrowFactory {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<EscrowFactory>(@unite_defi);
        assert!(table::contains(&factory.authorized_relayers, relayer_addr), E_NOT_AUTHORIZED_RELAYER);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        
        let order = table::borrow_mut(&mut factory.orders, order_id);
        assert!(order.state == 2, E_INVALID_ORDER_STATE); // must have escrows deployed
        
        // Verify secret matches hash
        let computed_hash = hash::sha3_256(secret);
        assert!(computed_hash == order.secret_hash, E_INVALID_ORDER_STATE);
        
        // Release resolver's safety deposit
        let resolver_deposit = table::borrow_mut(&mut factory.resolver_deposits, order.committed_resolver);
        resolver_deposit.locked_for_order = vector::empty();
        
        order.state = 3; // completed
    }

    public entry fun rescue_order<CoinType>(
        rescue_resolver: &signer,
        order_id: vector<u8>,
        secret: vector<u8>,
        timeout_timestamp: u64,
    ) acquires EscrowFactory {
        let rescue_resolver_addr = signer::address_of(rescue_resolver);
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        
        let factory = borrow_global_mut<EscrowFactory>(@unite_defi);
        assert!(table::contains(&factory.orders, order_id), E_ORDER_NOT_FOUND);
        assert!(table::contains(&factory.resolver_deposits, rescue_resolver_addr), E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        let order = table::borrow(&mut factory.orders, order_id);
        assert!(order.state == 2, E_INVALID_ORDER_STATE); // must have escrows deployed
        
        let current_time = timestamp::now_seconds();
        assert!(current_time >= timeout_timestamp, E_INVALID_ORDER_STATE); // must be timed out
        
        // Verify secret matches hash
        let computed_hash = hash::sha3_256(secret);
        assert!(computed_hash == order.secret_hash, E_INVALID_ORDER_STATE);
        
        let original_resolver = order.committed_resolver;
        
        // Transfer penalty from original resolver to rescue resolver
        let original_deposit = table::borrow_mut(&mut factory.resolver_deposits, original_resolver);
        let penalty_amount = SAFETY_DEPOSIT_AMOUNT;
        assert!(original_deposit.amount >= penalty_amount, E_INSUFFICIENT_SAFETY_DEPOSIT);
        original_deposit.amount = original_deposit.amount - penalty_amount;
        original_deposit.locked_for_order = vector::empty();
        
        let rescue_deposit = table::borrow_mut(&mut factory.resolver_deposits, rescue_resolver_addr);
        rescue_deposit.amount = rescue_deposit.amount + penalty_amount;
        
        // Transfer the penalty
        let resource_signer = account::create_signer_with_capability(&factory.signer_cap);
        let penalty = coin::withdraw<CoinType>(&resource_signer, penalty_amount);
        coin::deposit(rescue_resolver_addr, penalty);
        
        let order_mut = table::borrow_mut(&mut factory.orders, order_id);
        order_mut.state = 3; // completed by rescue
    }

    fun generate_escrow_key(
        maker: address,
        taker: address,
        amount: u64,
        hashlock: &vector<u8>,
        is_source: bool,
    ): vector<u8> {
        let key_data = vector::empty<u8>();
        vector::append(&mut key_data, bcs::to_bytes(&maker));
        vector::append(&mut key_data, bcs::to_bytes(&taker));
        vector::append(&mut key_data, bcs::to_bytes(&amount));
        vector::append(&mut key_data, *hashlock);
        vector::append(&mut key_data, bcs::to_bytes(&is_source));
        
        hash::sha3_256(key_data)
    }

    #[view]
    public fun get_order(order_id: vector<u8>): (u8, address, u64, u64, address, address) acquires EscrowFactory {
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        let factory = borrow_global<EscrowFactory>(@unite_defi);
        
        if (table::contains(&factory.orders, order_id)) {
            let order = table::borrow(&factory.orders, order_id);
            (order.state, order.user, order.src_amount, order.dst_amount, order.src_escrow, order.dst_escrow)
        } else {
            (0, @0x0, 0, 0, @0x0, @0x0)
        }
    }

    #[view]
    public fun get_resolver_deposit(resolver: address): (u64, bool) acquires EscrowFactory {
        if (!exists<EscrowFactory>(@unite_defi)) {
            return (0, false)
        };
        
        let factory = borrow_global<EscrowFactory>(@unite_defi);
        if (table::contains(&factory.resolver_deposits, resolver)) {
            let deposit = table::borrow(&factory.resolver_deposits, resolver);
            (deposit.amount, !vector::is_empty(&deposit.locked_for_order))
        } else {
            (0, false)
        }
    }

    #[view]
    public fun is_authorized_relayer(relayer: address): bool acquires EscrowFactory {
        if (!exists<EscrowFactory>(@unite_defi)) {
            return false
        };
        
        let factory = borrow_global<EscrowFactory>(@unite_defi);
        table::contains(&factory.authorized_relayers, relayer)
    }

    #[view]
    public fun get_escrow_address(
        maker: address,
        taker: address,
        amount: u64,
        hashlock: vector<u8>,
        is_source: bool,
    ): address acquires EscrowFactory {
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        let factory = borrow_global<EscrowFactory>(@unite_defi);
        
        let key = generate_escrow_key(maker, taker, amount, &hashlock, is_source);
        
        if (table::contains(&factory.escrows, key)) {
            let record = table::borrow(&factory.escrows, key);
            record.escrow_address
        } else {
            @0x0
        }
    }
}