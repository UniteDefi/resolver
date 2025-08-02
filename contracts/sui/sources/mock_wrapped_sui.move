module unite::mock_wrapped_sui {
    use sui::coin::{Self, Coin, TreasuryCap, CoinMetadata};
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::url;
    use sui::sui::SUI;
    use sui::balance::{Self, Balance};
    use std::option;

    /// The type identifier of Wrapped SUI coin
    public struct MOCK_WRAPPED_SUI has drop {}

    /// Storage for locked SUI
    public struct SuiVault has key, store {
        id: UID,
        /// Balance of actual SUI locked in the contract
        sui_balance: Balance<SUI>,
        /// Reference to the treasury cap for minting/burning wrapped SUI
        treasury_cap_id: ID,
    }

    /// Module initializer is called once on module publish.
    fun init(witness: MOCK_WRAPPED_SUI, ctx: &mut TxContext) {
        let (treasury, metadata) = coin::create_currency(
            witness,
            9, // Same as SUI
            b"WSUI",
            b"Mock Wrapped SUI",
            b"Mock Wrapped SUI for testing cross-chain swaps",
            option::some(url::new_unsafe_from_bytes(b"https://sui.io/logo.svg")),
            ctx
        );
        
        // Create the vault for storing locked SUI
        let vault = SuiVault {
            id: object::new(ctx),
            sui_balance: balance::zero<SUI>(),
            treasury_cap_id: object::id(&treasury),
        };
        
        // Share both treasury and vault
        transfer::public_share_object(treasury);
        transfer::public_share_object(vault);
        transfer::public_freeze_object(metadata);
    }

    /// Wrap SUI to get Wrapped SUI (1:1 ratio)
    public fun wrap(
        vault: &mut SuiVault,
        treasury: &mut TreasuryCap<MOCK_WRAPPED_SUI>,
        sui_coin: Coin<SUI>,
        ctx: &mut TxContext
    ): Coin<MOCK_WRAPPED_SUI> {
        let amount = coin::value(&sui_coin);
        
        // Lock the SUI in the vault
        let sui_balance = coin::into_balance(sui_coin);
        balance::join(&mut vault.sui_balance, sui_balance);
        
        // Mint equivalent wrapped SUI
        coin::mint(treasury, amount, ctx)
    }

    /// Wrap SUI and transfer to recipient
    public entry fun wrap_and_transfer(
        vault: &mut SuiVault,
        treasury: &mut TreasuryCap<MOCK_WRAPPED_SUI>,
        sui_coin: Coin<SUI>,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let wrapped = wrap(vault, treasury, sui_coin, ctx);
        transfer::public_transfer(wrapped, recipient);
    }

    /// Unwrap Wrapped SUI to get back SUI (1:1 ratio)
    public fun unwrap(
        vault: &mut SuiVault,
        treasury: &mut TreasuryCap<MOCK_WRAPPED_SUI>,
        wrapped_coin: Coin<MOCK_WRAPPED_SUI>,
        ctx: &mut TxContext
    ): Coin<SUI> {
        let amount = coin::value(&wrapped_coin);
        
        // Burn the wrapped SUI
        coin::burn(treasury, wrapped_coin);
        
        // Release equivalent SUI from vault
        let sui_balance = balance::split(&mut vault.sui_balance, amount);
        coin::from_balance(sui_balance, ctx)
    }

    /// Unwrap and transfer SUI to recipient
    public entry fun unwrap_and_transfer(
        vault: &mut SuiVault,
        treasury: &mut TreasuryCap<MOCK_WRAPPED_SUI>,
        wrapped_coin: Coin<MOCK_WRAPPED_SUI>,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let sui = unwrap(vault, treasury, wrapped_coin, ctx);
        transfer::public_transfer(sui, recipient);
    }

    /// Public mint function for testing (creates wrapped SUI without locking actual SUI)
    /// WARNING: This breaks the 1:1 peg and should only be used for testing
    public fun mint(
        treasury: &mut TreasuryCap<MOCK_WRAPPED_SUI>,
        amount: u64,
        ctx: &mut TxContext
    ): Coin<MOCK_WRAPPED_SUI> {
        coin::mint(treasury, amount, ctx)
    }

    /// Public mint and transfer function for testing
    public entry fun mint_and_transfer(
        treasury: &mut TreasuryCap<MOCK_WRAPPED_SUI>,
        amount: u64,
        recipient: address,
        ctx: &mut TxContext
    ) {
        let coin = mint(treasury, amount, ctx);
        transfer::public_transfer(coin, recipient);
    }

    /// Get the total supply of Wrapped SUI
    public fun total_supply(treasury: &TreasuryCap<MOCK_WRAPPED_SUI>): u64 {
        coin::total_supply(treasury)
    }

    /// Get the total SUI locked in the vault
    public fun vault_balance(vault: &SuiVault): u64 {
        balance::value(&vault.sui_balance)
    }

    /// Check if the vault is properly collateralized (wrapped supply <= locked SUI)
    public fun is_fully_collateralized(
        vault: &SuiVault,
        treasury: &TreasuryCap<MOCK_WRAPPED_SUI>
    ): bool {
        let wrapped_supply = total_supply(treasury);
        let locked_sui = vault_balance(vault);
        locked_sui >= wrapped_supply
    }

    #[test_only]
    public fun test_init(ctx: &mut TxContext) {
        init(MOCK_WRAPPED_SUI {}, ctx)
    }
}