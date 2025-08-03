module aptos_addr::test_coin {
    use std::signer;
    use std::string;
    use aptos_framework::coin::{Self, MintCapability, BurnCapability};
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};

    // Test USDT coin
    struct TestUSDT has key {}

    // Test DAI coin  
    struct TestDAI has key {}

    // Capabilities for minting/burning
    struct CoinCapabilities<phantom CoinType> has key {
        mint_cap: MintCapability<CoinType>,
        burn_cap: BurnCapability<CoinType>,
    }

    // Events
    struct MintEvent has drop, store {
        amount: u64,
        recipient: address,
    }

    struct BurnEvent has drop, store {
        amount: u64,
        account: address,
    }

    struct CoinStore<phantom CoinType> has key {
        mint_events: EventHandle<MintEvent>,
        burn_events: EventHandle<BurnEvent>,
    }

    // Initialize Test USDT
    entry public fun initialize_usdt(admin: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<TestUSDT>(
            admin,
            string::utf8(b"Test USDT"),
            string::utf8(b"TUSDT"),
            6, // 6 decimals like real USDT
            true, // monitor_supply
        );

        coin::destroy_freeze_cap(freeze_cap);

        let capabilities = CoinCapabilities<TestUSDT> {
            mint_cap,
            burn_cap,
        };

        let store = CoinStore<TestUSDT> {
            mint_events: account::new_event_handle<MintEvent>(admin),
            burn_events: account::new_event_handle<BurnEvent>(admin),
        };

        // Mint initial supply to admin (1M USDT)
        let initial_coins = coin::mint<TestUSDT>(1_000_000_000_000, &capabilities.mint_cap); // 1M with 6 decimals
        coin::deposit(signer::address_of(admin), initial_coins);
        
        move_to(admin, capabilities);
        move_to(admin, store);
    }

    // Initialize Test DAI  
    entry public fun initialize_dai(admin: &signer) {
       let (burn_cap, freeze_cap, mint_cap) = coin::initialize<TestDAI>(
        admin,
        string::utf8(b"Test DAI"),
        string::utf8(b"TDAI"),
        6, // Changed from 18 to 6 decimals
        true, // monitor_supply
    );

        coin::destroy_freeze_cap(freeze_cap);

        let capabilities = CoinCapabilities<TestDAI> {
            mint_cap,
            burn_cap,
        };

        let store = CoinStore<TestDAI> {
            mint_events: account::new_event_handle<MintEvent>(admin),
            burn_events: account::new_event_handle<BurnEvent>(admin),
        };

        // Mint initial supply to admin (1M DAI)
       let initial_coins = coin::mint<TestDAI>(1_000_000_000_000, &capabilities.mint_cap); // 1M with 6 decimals
        coin::deposit(signer::address_of(admin), initial_coins);
    
        move_to(admin, capabilities);
        move_to(admin, store);
    }

    // *** CRITICAL: Make mint functions ENTRY ***
    entry public fun mint_usdt(
        admin: &signer,
        recipient: address,
        amount: u64,
    ) acquires CoinCapabilities, CoinStore {
        let admin_addr = signer::address_of(admin);
        let capabilities = borrow_global<CoinCapabilities<TestUSDT>>(admin_addr);
        let store = borrow_global_mut<CoinStore<TestUSDT>>(admin_addr);

        // Auto-register if not registered
        if (!coin::is_account_registered<TestUSDT>(recipient)) {
            // We can't register for another account in Move, so just mint to admin and return
            let coins = coin::mint<TestUSDT>(amount, &capabilities.mint_cap);
            coin::deposit(admin_addr, coins);
            return
        };

        let coins = coin::mint<TestUSDT>(amount, &capabilities.mint_cap);
        coin::deposit(recipient, coins);

        event::emit_event(&mut store.mint_events, MintEvent {
            amount,
            recipient,
        });
    }

    // *** CRITICAL: Make mint functions ENTRY ***
    entry public fun mint_dai(
        admin: &signer,
        recipient: address,
        amount: u64,
    ) acquires CoinCapabilities, CoinStore {
        let admin_addr = signer::address_of(admin);
        let capabilities = borrow_global<CoinCapabilities<TestDAI>>(admin_addr);
        let store = borrow_global_mut<CoinStore<TestDAI>>(admin_addr);

        // Auto-register if not registered
        if (!coin::is_account_registered<TestDAI>(recipient)) {
            // We can't register for another account in Move, so just mint to admin and return
            let coins = coin::mint<TestDAI>(amount, &capabilities.mint_cap);
            coin::deposit(admin_addr, coins);
            return
        };

        let coins = coin::mint<TestDAI>(amount, &capabilities.mint_cap);
        coin::deposit(recipient, coins);

        event::emit_event(&mut store.mint_events, MintEvent {
            amount,
            recipient,
        });
    }

    // Burn USDT from account
    public fun burn_usdt(
        account: &signer,
        amount: u64,
        admin_addr: address,
    ) acquires CoinCapabilities, CoinStore {
        let capabilities = borrow_global<CoinCapabilities<TestUSDT>>(admin_addr);
        let store = borrow_global_mut<CoinStore<TestUSDT>>(admin_addr);
        let account_addr = signer::address_of(account);

        let coins = coin::withdraw<TestUSDT>(account, amount);
        coin::burn(coins, &capabilities.burn_cap);

        event::emit_event(&mut store.burn_events, BurnEvent {
            amount,
            account: account_addr,
        });
    }

    // Burn DAI from account
    public fun burn_dai(
        account: &signer,
        amount: u64,
        admin_addr: address,
    ) acquires CoinCapabilities, CoinStore {
        let capabilities = borrow_global<CoinCapabilities<TestDAI>>(admin_addr);
        let store = borrow_global_mut<CoinStore<TestDAI>>(admin_addr);
        let account_addr = signer::address_of(account);

        let coins = coin::withdraw<TestDAI>(account, amount);
        coin::burn(coins, &capabilities.burn_cap);

        event::emit_event(&mut store.burn_events, BurnEvent {
            amount,
            account: account_addr,
        });
    }

    // Get USDT balance - SAFE VERSION with registration check
    #[view]
    public fun get_usdt_balance(account: address): u64 {
        if (!coin::is_account_registered<TestUSDT>(account)) {
            0
        } else {
            coin::balance<TestUSDT>(account)
        }
    }

    // Get DAI balance - SAFE VERSION with registration check
    #[view] 
    public fun get_dai_balance(account: address): u64 {
        if (!coin::is_account_registered<TestDAI>(account)) {
            0
        } else {
            coin::balance<TestDAI>(account)
        }
    }

    // Register for USDT - ENTRY FUNCTION for tests
    entry public fun register_usdt(account: &signer) {
        if (!coin::is_account_registered<TestUSDT>(signer::address_of(account))) {
            coin::register<TestUSDT>(account);
        }
    }

    // Register for DAI - ENTRY FUNCTION for tests
    entry public fun register_dai(account: &signer) {
        if (!coin::is_account_registered<TestDAI>(signer::address_of(account))) {
            coin::register<TestDAI>(account);
        }
    }

    // Public register functions (non-entry) for use by other modules
    public fun register_usdt_public(account: &signer) {
        if (!coin::is_account_registered<TestUSDT>(signer::address_of(account))) {
            coin::register<TestUSDT>(account);
        }
    }

    public fun register_dai_public(account: &signer) {
        if (!coin::is_account_registered<TestDAI>(signer::address_of(account))) {
            coin::register<TestDAI>(account);
        }
    }

    // Generic balance function for any coin type
    public fun balance<CoinType>(account: address): u64 {
        if (!coin::is_account_registered<CoinType>(account)) {
            0
        } else {
            coin::balance<CoinType>(account)
        }
    }
}