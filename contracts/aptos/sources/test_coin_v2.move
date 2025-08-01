module aptos_addr::test_coin_v2 {
    use std::signer;
    use std::string;
    use aptos_framework::coin::{Self, MintCapability, BurnCapability};
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};

    // Test USDT coin v2
    struct TestUSDTV2 has key {}

    // Test DAI coin v2
    struct TestDAIV2 has key {}

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

    // Initialize Test USDT V2
    entry public fun initialize_usdt_v2(admin: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<TestUSDTV2>(
            admin,
            string::utf8(b"Test USDT V2"),
            string::utf8(b"TUSDTV2"),
            6, // 6 decimals like real USDT
            true, // monitor_supply
        );

        coin::destroy_freeze_cap(freeze_cap);

        let capabilities = CoinCapabilities<TestUSDTV2> {
            mint_cap,
            burn_cap,
        };

        let store = CoinStore<TestUSDTV2> {
            mint_events: account::new_event_handle<MintEvent>(admin),
            burn_events: account::new_event_handle<BurnEvent>(admin),
        };

        // Mint initial supply to admin (1M USDT)
        let initial_coins = coin::mint<TestUSDTV2>(1_000_000_000_000, &capabilities.mint_cap); // 1M with 6 decimals
        coin::deposit(signer::address_of(admin), initial_coins);
        
        move_to(admin, capabilities);
        move_to(admin, store);
    }

    // Initialize Test DAI V2
    entry public fun initialize_dai_v2(admin: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<TestDAIV2>(
            admin,
            string::utf8(b"Test DAI V2"),
            string::utf8(b"TDAIV2"),
            18, // 18 decimals like real DAI
            true, // monitor_supply
        );

        coin::destroy_freeze_cap(freeze_cap);

        let capabilities = CoinCapabilities<TestDAIV2> {
            mint_cap,
            burn_cap,
        };

        let store = CoinStore<TestDAIV2> {
            mint_events: account::new_event_handle<MintEvent>(admin),
            burn_events: account::new_event_handle<BurnEvent>(admin),
        };

        // Mint initial supply to admin (1M DAI)
        let initial_coins = coin::mint<TestDAIV2>(1000000, &capabilities.mint_cap); // 1M DAI (simplified for Move u64)
        coin::deposit(signer::address_of(admin), initial_coins);
        
        move_to(admin, capabilities);
        move_to(admin, store);
    }

    // Mint USDT V2 to specified account
    entry public fun mint_usdt_v2(
        admin: &signer,
        recipient: address,
        amount: u64,
    ) acquires CoinCapabilities, CoinStore {
        let admin_addr = signer::address_of(admin);
        let capabilities = borrow_global<CoinCapabilities<TestUSDTV2>>(admin_addr);
        let store = borrow_global_mut<CoinStore<TestUSDTV2>>(admin_addr);

        let coins = coin::mint<TestUSDTV2>(amount, &capabilities.mint_cap);
        coin::deposit(recipient, coins);

        event::emit_event(&mut store.mint_events, MintEvent {
            amount,
            recipient,
        });
    }

    // Mint DAI V2 to specified account
    entry public fun mint_dai_v2(
        admin: &signer,
        recipient: address,
        amount: u64,
    ) acquires CoinCapabilities, CoinStore {
        let admin_addr = signer::address_of(admin);
        let capabilities = borrow_global<CoinCapabilities<TestDAIV2>>(admin_addr);
        let store = borrow_global_mut<CoinStore<TestDAIV2>>(admin_addr);

        let coins = coin::mint<TestDAIV2>(amount, &capabilities.mint_cap);
        coin::deposit(recipient, coins);

        event::emit_event(&mut store.mint_events, MintEvent {
            amount,
            recipient,
        });
    }

    // Get USDT V2 balance
    #[view]
    public fun get_usdt_v2_balance(account: address): u64 {
        coin::balance<TestUSDTV2>(account)
    }

    // Get DAI V2 balance
    #[view] 
    public fun get_dai_v2_balance(account: address): u64 {
        coin::balance<TestDAIV2>(account)
    }

    // Register for USDT V2
    entry public fun register_usdt_v2(account: &signer) {
        coin::register<TestUSDTV2>(account);
    }

    // Register for DAI V2
    entry public fun register_dai_v2(account: &signer) {
        coin::register<TestDAIV2>(account);
    }
}