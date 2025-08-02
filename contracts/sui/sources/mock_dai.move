module unite::mock_dai {
    use sui::coin::{Self, Coin, TreasuryCap, CoinMetadata};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::url;
    use std::option;

    /// The type identifier of DAI coin
    public struct MOCK_DAI has drop {}

    /// Module initializer is called once on module publish.
    fun init(witness: MOCK_DAI, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            18, // DAI has 18 decimals
            b"DAI",
            b"Mock Dai Stablecoin",
            b"Mock DAI for testing cross-chain swaps",
            option::some(url::new_unsafe_from_bytes(b"https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets/0x6B175474E89094C44Da98b954EedeAC495271d0F/logo.png")),
            ctx
        );
        
        // Make treasury shared so anyone can mint for testing
        transfer::public_share_object(treasury);
        transfer::public_freeze_object(metadata);
    }

    /// Public mint function for testing
    public fun mint(
        treasury: &mut TreasuryCap<MOCK_DAI>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<MOCK_DAI> {
        coin::mint(treasury, amount, ctx)
    }

    /// Public mint and transfer function for testing
    public entry fun mint_and_transfer(
        treasury: &mut TreasuryCap<MOCK_DAI>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = coin::mint(treasury, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// Get the total supply of DAI
    public fun total_supply(treasury: &TreasuryCap<MOCK_DAI>): u64 {
        coin::total_supply(treasury)
    }

    /// Burn DAI coins
    public entry fun burn(treasury: &mut TreasuryCap<MOCK_DAI>, coin: Coin<MOCK_DAI>) {
        coin::burn(treasury, coin);
    }

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(MOCK_DAI {}, ctx)
    }
}