module unite_defi_sui::simple_escrow {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use std::string::String;

    // Structs
    struct Escrow has key {
        id: UID,
        escrow_id: String,
        sender: address,
        recipient: address,
        amount: Coin<SUI>,
        secret_hash: vector<u8>,
        revealed: bool,
    }

    // Events
    struct EscrowCreated has copy, drop {
        escrow_id: String,
        sender: address,
        recipient: address,
        amount: u64,
    }

    struct SecretRevealed has copy, drop {
        escrow_id: String,
        secret: vector<u8>,
    }

    struct EscrowCompleted has copy, drop {
        escrow_id: String,
        recipient: address,
        amount: u64,
    }

    // Create escrow
    public entry fun create_escrow(
        escrow_id: String,
        recipient: address,
        payment: Coin<SUI>,
        secret_hash: vector<u8>,
        ctx: &mut TxContext
    ) {
        let sender = tx_context::sender(ctx);
        let amount = coin::value(&payment);

        let escrow = Escrow {
            id: object::new(ctx),
            escrow_id,
            sender,
            recipient,
            amount: payment,
            secret_hash,
            revealed: false,
        };

        event::emit(EscrowCreated {
            escrow_id,
            sender,
            recipient,
            amount,
        });

        transfer::share_object(escrow);
    }

    // Reveal secret
    public entry fun reveal_secret(
        escrow: &mut Escrow,
        secret: vector<u8>,
        _ctx: &mut TxContext
    ) {
        // In production, verify hash here
        escrow.revealed = true;

        event::emit(SecretRevealed {
            escrow_id: escrow.escrow_id,
            secret,
        });
    }

    // Complete escrow
    public entry fun complete_escrow(
        escrow: Escrow,
        _ctx: &mut TxContext
    ) {
        let Escrow { 
            id, 
            escrow_id, 
            sender: _, 
            recipient, 
            amount, 
            secret_hash: _, 
            revealed: _ 
        } = escrow;

        let amount_value = coin::value(&amount);

        event::emit(EscrowCompleted {
            escrow_id,
            recipient,
            amount: amount_value,
        });

        transfer::public_transfer(amount, recipient);
        object::delete(id);
    }
}