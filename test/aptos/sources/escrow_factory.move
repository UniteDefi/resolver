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
    use unite_defi::dutch_auction;

    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_RESOLVER_ALREADY_LOCKED: u64 = 3;
    const E_INSUFFICIENT_ALLOWANCE: u64 = 4;
    const E_INSUFFICIENT_SAFETY_DEPOSIT: u64 = 5;
    const E_AUCTION_NOT_ACTIVE: u64 = 6;
    const E_ESCROW_ALREADY_EXISTS: u64 = 7;

    const SAFETY_DEPOSIT_AMOUNT: u64 = 1000000; // 0.01 APT

    struct EscrowFactory has key {
        signer_cap: SignerCapability,
        escrow_counter: u64,
        escrows: Table<vector<u8>, EscrowRecord>,
        resolver_locks: Table<u64, ResolverLock>,
    }

    struct EscrowRecord has store {
        escrow_address: address,
        maker: address,
        taker: address,
        token_amount: u64,
        is_source: bool,
        created_at: u64,
    }

    struct ResolverLock has store {
        resolver: address,
        auction_id: u64,
        escrow_src: address,
        escrow_dst: address,
        locked_at: u64,
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
            resolver_locks: table::new(),
        };
        
        move_to(deployer, factory);
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

    public entry fun create_escrow_for_auction<CoinType>(
        resolver: &signer,
        auction_id: u64,
        maker: address,
        taker: address,
        token_amount: u64,
        hashlock: vector<u8>,
        withdrawal_deadline: u64,
        public_withdrawal_deadline: u64,
        cancellation_deadline: u64,
        public_cancellation_deadline: u64,
        is_source: bool,
        safety_deposit_amount: u64,
    ) acquires EscrowFactory, TokenAllowance {
        let resolver_addr = signer::address_of(resolver);
        
        assert!(dutch_auction::is_auction_active(auction_id), E_AUCTION_NOT_ACTIVE);
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        assert!(safety_deposit_amount >= SAFETY_DEPOSIT_AMOUNT, E_INSUFFICIENT_SAFETY_DEPOSIT);
        
        // Withdraw safety deposit from resolver
        let safety_deposit = coin::withdraw<AptosCoin>(resolver, safety_deposit_amount);
        
        // Check locks and generate key first
        let escrow_key = generate_escrow_key(
            maker,
            taker,
            token_amount,
            &hashlock,
            is_source
        );
        
        // First borrow to check constraints
        {
            let factory = borrow_global<EscrowFactory>(@unite_defi);
            assert!(!table::contains(&factory.resolver_locks, auction_id), E_RESOLVER_ALREADY_LOCKED);
            assert!(!table::contains(&factory.escrows, escrow_key), E_ESCROW_ALREADY_EXISTS);
        };
        
        // Withdraw tokens - this may also borrow EscrowFactory
        let tokens = if (is_source) {
            withdraw_from_allowance<CoinType>(taker, token_amount)
        } else {
            coin::withdraw<CoinType>(resolver, token_amount)
        };
        
        // Now get mutable borrow for modifications
        let factory = borrow_global_mut<EscrowFactory>(@unite_defi);
        let resource_signer = account::create_signer_with_capability(&factory.signer_cap);
        let escrow_seed = vector::empty<u8>();
        vector::append(&mut escrow_seed, b"escrow_");
        vector::append(&mut escrow_seed, escrow_key);
        
        let (escrow_resource, _escrow_cap) = account::create_resource_account(
            &resource_signer,
            escrow_seed
        );
        
        let escrow_address = signer::address_of(&escrow_resource);
        
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
            is_source,
            created_at: timestamp::now_seconds(),
        };
        
        table::add(&mut factory.escrows, escrow_key, escrow_record);
        
        if (!table::contains(&factory.resolver_locks, auction_id)) {
            let lock = ResolverLock {
                resolver: resolver_addr,
                auction_id,
                escrow_src: if (is_source) { escrow_address } else { @0x0 },
                escrow_dst: if (!is_source) { escrow_address } else { @0x0 },
                locked_at: timestamp::now_seconds(),
            };
            table::add(&mut factory.resolver_locks, auction_id, lock);
        } else {
            let lock = table::borrow_mut(&mut factory.resolver_locks, auction_id);
            if (is_source) {
                lock.escrow_src = escrow_address;
            } else {
                lock.escrow_dst = escrow_address;
            };
        };
        
        events::emit_escrow_created(
            escrow_address,
            maker,
            taker,
            token_amount,
            hashlock,
            SAFETY_DEPOSIT_AMOUNT,
            1, // Aptos chain ID placeholder
            11155111, // Base Sepolia chain ID
            timestamp::now_seconds(),
        );
        
        factory.escrow_counter = factory.escrow_counter + 1;
    }

    fun withdraw_from_allowance<CoinType>(
        owner: address,
        amount: u64,
    ): Coin<CoinType> acquires TokenAllowance, EscrowFactory {
        assert!(exists<TokenAllowance<CoinType>>(owner), E_INSUFFICIENT_ALLOWANCE);
        
        let allowance = borrow_global_mut<TokenAllowance<CoinType>>(owner);
        assert!(table::contains(&allowance.allowances, @unite_defi), E_INSUFFICIENT_ALLOWANCE);
        
        let approved_amount = table::borrow_mut(&mut allowance.allowances, @unite_defi);
        assert!(*approved_amount >= amount, E_INSUFFICIENT_ALLOWANCE);
        
        *approved_amount = *approved_amount - amount;
        
        coin::withdraw<CoinType>(&account::create_signer_with_capability(&borrow_global<EscrowFactory>(@unite_defi).signer_cap), amount)
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
    public fun get_resolver_lock(auction_id: u64): (address, address, address) acquires EscrowFactory {
        assert!(exists<EscrowFactory>(@unite_defi), E_NOT_INITIALIZED);
        let factory = borrow_global<EscrowFactory>(@unite_defi);
        
        if (table::contains(&factory.resolver_locks, auction_id)) {
            let lock = table::borrow(&factory.resolver_locks, auction_id);
            (lock.resolver, lock.escrow_src, lock.escrow_dst)
        } else {
            (@0x0, @0x0, @0x0)
        }
    }

    #[view]
    public fun is_resolver_locked(auction_id: u64): bool acquires EscrowFactory {
        if (!exists<EscrowFactory>(@unite_defi)) {
            return false
        };
        
        let factory = borrow_global<EscrowFactory>(@unite_defi);
        table::contains(&factory.resolver_locks, auction_id)
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