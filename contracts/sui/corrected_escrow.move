module unite_defi_sui::corrected_escrow {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use std::string::String;

    // Constants
    const E_INVALID_SECRET: u64 = 1;
    const E_TIMEOUT_NOT_REACHED: u64 = 2;
    const E_ALREADY_FUNDED: u64 = 3;
    const E_NOT_FUNDED: u64 = 4;

    // Structs
    struct Escrow has key {
        id: UID,
        swap_id: String,
        resolver: address,
        user: address,
        resolver_deposit: Coin<SUI>,
        user_funds: Option<Coin<SUI>>,
        secret_hash: vector<u8>,
        created_at: u64,
        timeout: u64,
        is_src: bool,
    }

    // Events
    struct EscrowCreated has copy, drop {
        swap_id: String,
        resolver: address,
        user: address,
        deposit_amount: u64,
        is_src: bool,
    }

    struct UserFundsAdded has copy, drop {
        swap_id: String,
        amount: u64,
    }

    struct ResolverFundsAdded has copy, drop {
        swap_id: String,
        amount: u64,
    }

    struct SecretRevealed has copy, drop {
        swap_id: String,
        secret: vector<u8>,
        beneficiary: address,
    }

    // Create source escrow (called by resolver with safety deposit)
    public entry fun deploy_src(
        swap_id: String,
        user: address,
        safety_deposit: Coin<SUI>,
        secret_hash: vector<u8>,
        timeout: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let resolver = tx_context::sender(ctx);
        let deposit_amount = coin::value(&safety_deposit);
        let created_at = clock::timestamp_ms(clock);

        let escrow = Escrow {
            id: object::new(ctx),
            swap_id,
            resolver,
            user,
            resolver_deposit: safety_deposit,
            user_funds: option::none(),
            secret_hash,
            created_at,
            timeout,
            is_src: true,
        };

        event::emit(EscrowCreated {
            swap_id,
            resolver,
            user,
            deposit_amount,
            is_src: true,
        });

        transfer::share_object(escrow);
    }

    // Create destination escrow (called by resolver with safety deposit)
    public entry fun deploy_dest(
        swap_id: String,
        user: address,
        safety_deposit: Coin<SUI>,
        secret_hash: vector<u8>,
        timeout: u64,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let resolver = tx_context::sender(ctx);
        let deposit_amount = coin::value(&safety_deposit);
        let created_at = clock::timestamp_ms(clock);

        let escrow = Escrow {
            id: object::new(ctx),
            swap_id,
            resolver,
            user,
            resolver_deposit: safety_deposit,
            user_funds: option::none(),
            secret_hash,
            created_at,
            timeout,
            is_src: false,
        };

        event::emit(EscrowCreated {
            swap_id,
            resolver,
            user,
            deposit_amount,
            is_src: false,
        });

        transfer::share_object(escrow);
    }

    // Add user funds to source escrow (called by relayer)
    public entry fun add_user_funds(
        escrow: &mut Escrow,
        funds: Coin<SUI>,
        _ctx: &mut TxContext
    ) {
        assert!(option::is_none(&escrow.user_funds), E_ALREADY_FUNDED);
        let amount = coin::value(&funds);
        
        option::fill(&mut escrow.user_funds, funds);

        event::emit(UserFundsAdded {
            swap_id: escrow.swap_id,
            amount,
        });
    }

    // Add resolver funds to destination escrow (called by resolver)
    public entry fun add_resolver_funds(
        escrow: &mut Escrow,
        funds: Coin<SUI>,
        _ctx: &mut TxContext
    ) {
        assert!(option::is_none(&escrow.user_funds), E_ALREADY_FUNDED);
        let amount = coin::value(&funds);
        
        option::fill(&mut escrow.user_funds, funds);

        event::emit(ResolverFundsAdded {
            swap_id: escrow.swap_id,
            amount,
        });
    }

    // Reveal secret on destination (called by relayer)
    // User gets funds, resolver gets safety deposit back
    public entry fun reveal_dest(
        escrow: Escrow,
        secret: vector<u8>,
        _ctx: &mut TxContext
    ) {
        // In production, verify hash(secret) == secret_hash
        assert!(!escrow.is_src, E_INVALID_SECRET);
        
        let Escrow { 
            id, 
            swap_id, 
            resolver, 
            user, 
            resolver_deposit, 
            user_funds, 
            secret_hash: _, 
            created_at: _,
            timeout: _,
            is_src: _,
        } = escrow;

        assert!(option::is_some(&user_funds), E_NOT_FUNDED);
        let funds = option::destroy_some(user_funds);

        event::emit(SecretRevealed {
            swap_id,
            secret,
            beneficiary: user,
        });

        // User gets the funds
        transfer::public_transfer(funds, user);
        // Resolver gets safety deposit back
        transfer::public_transfer(resolver_deposit, resolver);
        
        object::delete(id);
    }

    // Claim on source with secret (called by resolver)
    // Resolver gets user funds + safety deposit back
    public entry fun claim_src(
        escrow: Escrow,
        secret: vector<u8>,
        ctx: &mut TxContext
    ) {
        // In production, verify hash(secret) == secret_hash
        assert!(escrow.is_src, E_INVALID_SECRET);
        let resolver = tx_context::sender(ctx);
        assert!(resolver == escrow.resolver, E_INVALID_SECRET);
        
        let Escrow { 
            id, 
            swap_id, 
            resolver, 
            user: _, 
            resolver_deposit, 
            user_funds, 
            secret_hash: _, 
            created_at: _,
            timeout: _,
            is_src: _,
        } = escrow;

        assert!(option::is_some(&user_funds), E_NOT_FUNDED);
        let funds = option::destroy_some(user_funds);

        event::emit(SecretRevealed {
            swap_id,
            secret,
            beneficiary: resolver,
        });

        // Resolver gets both user funds and safety deposit
        let total = coin::zero<SUI>(ctx);
        coin::join(&mut total, funds);
        coin::join(&mut total, resolver_deposit);
        
        transfer::public_transfer(total, resolver);
        object::delete(id);
    }

    // Timeout rescue function
    public entry fun rescue(
        escrow: Escrow,
        clock: &Clock,
        ctx: &mut TxContext
    ) {
        let current_time = clock::timestamp_ms(clock);
        assert!(current_time > escrow.created_at + escrow.timeout, E_TIMEOUT_NOT_REACHED);
        
        let Escrow { 
            id, 
            swap_id: _, 
            resolver, 
            user, 
            resolver_deposit, 
            user_funds, 
            secret_hash: _, 
            created_at: _,
            timeout: _,
            is_src,
        } = escrow;

        if (is_src) {
            // Return user funds if they exist
            if (option::is_some(&user_funds)) {
                let funds = option::destroy_some(user_funds);
                transfer::public_transfer(funds, user);
            } else {
                option::destroy_none(user_funds);
            };
            // Forfeit resolver deposit to rescue caller
            transfer::public_transfer(resolver_deposit, tx_context::sender(ctx));
        } else {
            // On dest chain, return resolver deposit
            transfer::public_transfer(resolver_deposit, resolver);
            if (option::is_some(&user_funds)) {
                let funds = option::destroy_some(user_funds);
                transfer::public_transfer(funds, resolver);
            } else {
                option::destroy_none(user_funds);
            };
        }
        
        object::delete(id);
    }
}