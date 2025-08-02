module unite::mock_usdt {
    use sui::coin::{Self, Coin, TreasuryCap, CoinMetadata};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::url;
    use std::option;

    /// The type identifier of USDT coin
    public struct MOCK_USDT has drop {}

    /// Module initializer is called once on module publish.
    fun init(witness: MOCK_USDT, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            6, // USDT has 6 decimals
            b"USDT",
            b"Mock Tether USD",
            b"Mock USDT for testing cross-chain swaps",
            option::some(url::new_unsafe_from_bytes(b"https://tether.to/images/logoMarkGreen.svg")),
            ctx
        );
        
        // Make treasury shared so anyone can mint for testing
        transfer::public_share_object(treasury);
        transfer::public_freeze_object(metadata);
    }

    /// Public mint function for testing
    public fun mint(
        treasury: &mut TreasuryCap<MOCK_USDT>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<MOCK_USDT> {
        coin::mint(treasury, amount, ctx)
    }

    /// Public mint and transfer function for testing
    public entry fun mint_and_transfer(
        treasury: &mut TreasuryCap<MOCK_USDT>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// Get the total supply of USDT
    public fun total_supply(treasury: &TreasuryCap<MOCK_USDT>): u64 {
        coin::total_supply(treasury)
    }

    /// Burn USDT coins
    public entry fun burn(treasury: &mut TreasuryCap<MOCK_USDT>, coin: Coin<MOCK_USDT>) {
        coin::burn(treasury, coin);
    }

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(MOCK_USDT {}, ctx)
    }
}