module mock::mock_usdc {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::coin::{Self, Coin, TreasuryCap};
    use sui::balance::{Self, Balance};
    use sui::event;

    // Mock USDC for testing
    struct MOCK_USDC has drop {}

    // Faucet for minting test tokens
    struct Faucet has key {
        id: UID,
        treasury: TreasuryCap<MOCK_USDC>,
        total_supply: u64,
    }

    // Events
    struct TokensMinted has copy, drop {
        recipient: address,
        amount: u64,
    }

    // Initialize mock USDC
    fun init(witness: MOCK_USDC, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            6, // USDC has 6 decimals
            b"MUSDC",
            b"Mock USDC",
            b"Mock USDC for testing cross-chain swaps",
            option::none(),
            ctx
        );

        let faucet = Faucet {
            id: object::new(ctx),
            treasury,
            total_supply: 0,
        };

        transfer::public_freeze_object(metadata);
        transfer::share_object(faucet);
    }

    // Mint tokens for testing
    public fun mint(
        faucet: &mut Faucet,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<MOCK_USDC> {
        let recipient = tx_context::sender(ctx);
        faucet.total_supply = faucet.total_supply + amount;

        event::emit(TokensMinted {
            recipient,
            amount,
        });

        coin::mint(&mut faucet.treasury, amount, ctx)
    }

    // Mint and transfer to specific address
    public fun mint_to(
        faucet: &mut Faucet,
        recipient: address,
        amount: u64,
        ctx: &mut TxContext,
    ) {
        let coins = mint(faucet, amount, ctx);
        transfer::public_transfer(coins, recipient);
    }

    // Get total supply
    public fun total_supply(faucet: &Faucet): u64 {
        faucet.total_supply
    }

    // Burn tokens (for testing cleanup)
    public fun burn(
        faucet: &mut Faucet,
        coins: Coin<MOCK_USDC>,
    ) {
        let amount = coin::value(&coins);
        faucet.total_supply = faucet.total_supply - amount;
        coin::burn(&mut faucet.treasury, coins);
    }

    #[test_only]
    public fun init_for_testing(ctx: &mut TxContext) {
        init(MOCK_USDC {}, ctx);
    }
}