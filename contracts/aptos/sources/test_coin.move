module unite_resolver::test_coin {
    use std::signer;
    use std::string;
    use aptos_framework::coin;

    // Test USDT
    struct USDT {}

    // Test DAI
    struct DAI {}

    const DECIMALS: u8 = 6;
    const INITIAL_SUPPLY: u64 = 1000000000000; // 1M tokens with 6 decimals

    public fun initialize_usdt(admin: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<USDT>(
            admin,
            string::utf8(b"Test USDT"),
            string::utf8(b"USDT"),
            DECIMALS,
            true,
        );
        
        // Mint initial supply to admin
        let coins = coin::mint(INITIAL_SUPPLY, &mint_cap);
        coin::register<USDT>(admin);
        coin::deposit(signer::address_of(admin), coins);
        
        // Destroy capabilities
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_freeze_cap(freeze_cap);
        coin::destroy_mint_cap(mint_cap);
    }

    public fun initialize_dai(admin: &signer) {
        let (burn_cap, freeze_cap, mint_cap) = coin::initialize<DAI>(
            admin,
            string::utf8(b"Test DAI"),
            string::utf8(b"DAI"),
            DECIMALS,
            true,
        );
        
        // Mint initial supply to admin
        let coins = coin::mint(INITIAL_SUPPLY, &mint_cap);
        coin::register<DAI>(admin);
        coin::deposit(signer::address_of(admin), coins);
        
        // Destroy capabilities
        coin::destroy_burn_cap(burn_cap);
        coin::destroy_freeze_cap(freeze_cap);
        coin::destroy_mint_cap(mint_cap);
    }

    public entry fun register_and_mint_usdt(account: &signer, amount: u64) {
        if (!coin::is_account_registered<USDT>(signer::address_of(account))) {
            coin::register<USDT>(account);
        }
        // In production, this would require mint capability
        // For testing, we assume the admin has pre-minted tokens
    }

    public entry fun register_and_mint_dai(account: &signer, amount: u64) {
        if (!coin::is_account_registered<DAI>(signer::address_of(account))) {
            coin::register<DAI>(account);
        }
        // In production, this would require mint capability
        // For testing, we assume the admin has pre-minted tokens
    }
}