module unite_defi_sui::unite_escrow_factory {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::table::{Self, Table};
    use std::vector;

    // Error constants
    const E_NOT_OWNER: u64 = 1;
    const E_NOT_AUTHORIZED_RELAYER: u64 = 2;
    const E_INVALID_ADDRESS: u64 = 3;
    const E_INSUFFICIENT_ALLOWANCE: u64 = 4;
    const E_INVALID_AMOUNT: u64 = 5;

    // The factory singleton
    struct UniteEscrowFactory has key {
        id: UID,
        owner: address,
        authorized_relayers: Table<address, bool>,
        // User allowances: user -> token -> amount
        // In Sui, we simplify to track SUI allowances only
        user_allowances: Table<address, u64>,
    }

    // Events
    struct RelayerAuthorized has copy, drop {
        relayer: address,
    }

    struct RelayerRevoked has copy, drop {
        relayer: address,
    }

    struct UserApproval has copy, drop {
        user: address,
        amount: u64,
    }

    struct UserFundsTransferredToEscrow has copy, drop {
        user: address,
        escrow: address,
        amount: u64,
    }

    // Initialize the factory
    fun init(ctx: &mut TxContext) {
        let factory = UniteEscrowFactory {
            id: object::new(ctx),
            owner: tx_context::sender(ctx),
            authorized_relayers: table::new(ctx),
            user_allowances: table::new(ctx),
        };
        
        // Authorize owner as initial relayer
        table::add(&mut factory.authorized_relayers, tx_context::sender(ctx), true);
        
        transfer::share_object(factory);
    }

    // Owner functions
    public entry fun authorize_relayer(
        factory: &mut UniteEscrowFactory,
        relayer: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == factory.owner, E_NOT_OWNER);
        assert!(relayer != @0x0, E_INVALID_ADDRESS);
        
        if (!table::contains(&factory.authorized_relayers, relayer)) {
            table::add(&mut factory.authorized_relayers, relayer, true);
        } else {
            *table::borrow_mut(&mut factory.authorized_relayers, relayer) = true;
        };
        
        event::emit(RelayerAuthorized { relayer });
    }

    public entry fun revoke_relayer(
        factory: &mut UniteEscrowFactory,
        relayer: address,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == factory.owner, E_NOT_OWNER);
        
        if (table::contains(&factory.authorized_relayers, relayer)) {
            *table::borrow_mut(&mut factory.authorized_relayers, relayer) = false;
        };
        
        event::emit(RelayerRevoked { relayer });
    }

    // User approves funds to factory
    public entry fun approve_funds(
        factory: &mut UniteEscrowFactory,
        amount: u64,
        ctx: &mut TxContext
    ) {
        let user = tx_context::sender(ctx);
        
        if (!table::contains(&factory.user_allowances, user)) {
            table::add(&mut factory.user_allowances, user, amount);
        } else {
            let current = *table::borrow(&factory.user_allowances, user);
            *table::borrow_mut(&mut factory.user_allowances, user) = current + amount;
        };
        
        event::emit(UserApproval { user, amount });
    }

    // Deposit funds to increase allowance
    public entry fun deposit_and_approve(
        factory: &mut UniteEscrowFactory,
        payment: Coin<SUI>,
        ctx: &mut TxContext
    ) {
        let user = tx_context::sender(ctx);
        let amount = coin::value(&payment);
        
        // Store the coin in the factory (in production, would use a more sophisticated storage)
        transfer::public_transfer(payment, object::uid_to_address(&factory.id));
        
        // Update allowance
        if (!table::contains(&factory.user_allowances, user)) {
            table::add(&mut factory.user_allowances, user, amount);
        } else {
            let current = *table::borrow(&factory.user_allowances, user);
            *table::borrow_mut(&mut factory.user_allowances, user) = current + amount;
        };
        
        event::emit(UserApproval { user, amount });
    }

    // Authorized relayer transfers user funds to escrow
    public entry fun transfer_user_funds_to_escrow(
        factory: &mut UniteEscrowFactory,
        user: address,
        amount: u64,
        escrow: address,
        payment: Coin<SUI>, // In Sui, we need to pass the actual coin
        ctx: &mut TxContext
    ) {
        let relayer = tx_context::sender(ctx);
        
        // Check relayer authorization
        assert!(
            table::contains(&factory.authorized_relayers, relayer) && 
            *table::borrow(&factory.authorized_relayers, relayer),
            E_NOT_AUTHORIZED_RELAYER
        );
        
        // Check user allowance
        assert!(table::contains(&factory.user_allowances, user), E_INSUFFICIENT_ALLOWANCE);
        let allowance = *table::borrow(&factory.user_allowances, user);
        assert!(allowance >= amount, E_INSUFFICIENT_ALLOWANCE);
        assert!(amount > 0, E_INVALID_AMOUNT);
        
        // Deduct allowance
        *table::borrow_mut(&mut factory.user_allowances, user) = allowance - amount;
        
        // Transfer funds to escrow
        assert!(coin::value(&payment) == amount, E_INVALID_AMOUNT);
        transfer::public_transfer(payment, escrow);
        
        event::emit(UserFundsTransferredToEscrow {
            user,
            escrow,
            amount,
        });
    }

    // View functions
    public fun is_authorized_relayer(factory: &UniteEscrowFactory, relayer: address): bool {
        table::contains(&factory.authorized_relayers, relayer) && 
        *table::borrow(&factory.authorized_relayers, relayer)
    }

    public fun get_user_allowance(factory: &UniteEscrowFactory, user: address): u64 {
        if (table::contains(&factory.user_allowances, user)) {
            *table::borrow(&factory.user_allowances, user)
        } else {
            0
        }
    }

    public fun get_owner(factory: &UniteEscrowFactory): address {
        factory.owner
    }
}