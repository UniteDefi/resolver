module unite::mock_usdc {
    use sui::coin::{Self, TreasuryCap, Coin};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::event;
    use std::option;

    /// Mock USDC coin type
    public struct MOCK_USDC has drop {}

    /// Treasury state
    public struct Treasury has key, store {
        id: UID,
        cap: TreasuryCap<MOCK_USDC>,
        admin: address,
    }

    /// Events
    public struct TokensMinted has copy, drop {
        amount: u64,
        recipient: address,
    }

    public struct TokensBurned has copy, drop {
        amount: u64,
        from: address,
    }

    /// Initialize the mock USDC coin
    fun init(witness: MOCK_USDC, ctx: &mut TxContext) {
        let (treasury_cap, metadata) = coin::create_currency(
            witness,
            6, // 6 decimals like real USDC
            b"USDC",
            b"Mock USD Coin",
            b"A mock USDC token for testing",
            option::none(),
            ctx
        );

        let admin = tx_context::sender(ctx);

        let treasury = Treasury {
            id: object::new(ctx),
            cap: treasury_cap,
            admin,
        };

        // Share the treasury so anyone can request test tokens
        transfer::share_object(treasury);
        transfer::public_freeze_object(metadata);
    }

    /// Mint tokens for testing (anyone can call)
    public fun mint(
        treasury: &mut Treasury,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ): Coin<MOCK_USDC> {
        let coin = coin::mint(&mut treasury.cap, amount, ctx);
        
        event::emit(TokensMinted {
            amount,
            recipient,
        });

        coin
    }

    /// Mint and transfer tokens
    public fun mint_and_transfer(
        treasury: &mut Treasury,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = mint(treasury, amount, recipient, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// Burn tokens
    public fun burn(
        treasury: &mut Treasury,
        coin: Coin<MOCK_USDC>,
        ctx: &mut TxContext
    ) {
        let amount = coin::value(&coin);
        coin::burn(&mut treasury.cap, coin);
        
        event::emit(TokensBurned {
            amount,
            from: tx_context::sender(ctx),
        });
    }

    /// Get total supply
    public fun total_supply(treasury: &Treasury): u64 {
        coin::total_supply(&treasury.cap)
    }

    /// Get treasury admin
    public fun get_admin(treasury: &Treasury): address {
        treasury.admin
    }
}