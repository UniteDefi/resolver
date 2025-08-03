module unite::mock_tokens_v2 {
    use sui::coin::{Self, Coin, TreasuryCap, CoinMetadata};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::url;
    use std::option;

    // USDT with 6 decimals
    public struct MOCK_USDT_V2 has drop {}

    // DAI with 6 decimals  
    public struct MOCK_DAI_V2 has drop {}

    /// Module initializer
    fun init(ctx: &mut TxContext) {
        // Create USDT with 6 decimals
        let (usdt_treasury, usdt_metadata) = coin::create_currency(
            MOCK_USDT_V2 {},
            6, // 6 decimals
            b"USDT",
            b"Mock Tether USD v2",
            b"Mock USDT with 6 decimals for cross-chain compatibility",
            option::some(url::new_unsafe_from_bytes(b"https://tether.to/images/logoMarkGreen.svg")),
            ctx
        );
        
        // Create DAI with 6 decimals
        let (dai_treasury, dai_metadata) = coin::create_currency(
            MOCK_DAI_V2 {},
            6, // 6 decimals (changed from 18)
            b"DAI",
            b"Mock Dai Stablecoin v2",
            b"Mock DAI with 6 decimals for cross-chain compatibility",
            option::some(url::new_unsafe_from_bytes(b"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png")),
            ctx
        );
        
        // Make treasuries shared so anyone can mint for testing
        transfer::public_share_object(usdt_treasury);
        transfer::public_share_object(dai_treasury);
        
        // Freeze metadata
        transfer::public_freeze_object(usdt_metadata);
        transfer::public_freeze_object(dai_metadata);
    }

    // USDT functions
    public fun mint_usdt(
        treasury: &mut TreasuryCap<MOCK_USDT_V2>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<MOCK_USDT_V2> {
        coin::mint(treasury, amount, ctx)
    }

    public entry fun mint_and_transfer_usdt(
        treasury: &mut TreasuryCap<MOCK_USDT_V2>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    // DAI functions
    public fun mint_dai(
        treasury: &mut TreasuryCap<MOCK_DAI_V2>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<MOCK_DAI_V2> {
        coin::mint(treasury, amount, ctx)
    }

    public entry fun mint_and_transfer_dai(
        treasury: &mut TreasuryCap<MOCK_DAI_V2>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    // Utility functions
    public fun total_supply_usdt(treasury: &TreasuryCap<MOCK_USDT_V2>): u64 {
        coin::total_supply(treasury)
    }

    public fun total_supply_dai(treasury: &TreasuryCap<MOCK_DAI_V2>): u64 {
        coin::total_supply(treasury)
    }

    public entry fun burn_usdt(treasury: &mut TreasuryCap<MOCK_USDT_V2>, coin: Coin<MOCK_USDT_V2>) {
        coin::burn(treasury, coin);
    }

    public entry fun burn_dai(treasury: &mut TreasuryCap<MOCK_DAI_V2>, coin: Coin<MOCK_DAI_V2>) {
        coin::burn(treasury, coin);
    }

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(ctx)
    }
}