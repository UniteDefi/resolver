module unite_defi_sui::simple_relayer {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use std::string::String;

    // Structs
    struct RelayerContract has key {
        id: UID,
        admin: address,
        total_orders: u64,
    }

    struct Order has key, store {
        id: UID,
        order_id: String,
        user: address,
        source_amount: u64,
        dest_amount: u64,
        status: u8, // 0: pending, 1: committed, 2: completed
    }

    // Events
    struct OrderCreated has copy, drop {
        order_id: String,
        user: address,
        source_amount: u64,
        dest_amount: u64,
    }

    struct OrderCompleted has copy, drop {
        order_id: String,
        user: address,
    }

    // Initialize
    fun init(ctx: &mut TxContext) {
        let relayer = RelayerContract {
            id: object::new(ctx),
            admin: tx_context::sender(ctx),
            total_orders: 0,
        };
        transfer::share_object(relayer);
    }

    // Create order
    public entry fun create_order(
        relayer: &mut RelayerContract,
        order_id: String,
        source_amount: u64,
        dest_amount: u64,
        ctx: &mut TxContext
    ) {
        let user = tx_context::sender(ctx);
        
        let order = Order {
            id: object::new(ctx),
            order_id,
            user,
            source_amount,
            dest_amount,
            status: 0,
        };

        relayer.total_orders = relayer.total_orders + 1;

        event::emit(OrderCreated {
            order_id,
            user,
            source_amount,
            dest_amount,
        });

        transfer::public_transfer(order, user);
    }

    // Complete order
    public entry fun complete_order(
        order: Order,
        ctx: &mut TxContext
    ) {
        let Order { id, order_id, user, source_amount: _, dest_amount: _, status: _ } = order;
        
        event::emit(OrderCompleted {
            order_id,
            user,
        });

        object::delete(id);
    }

    // Deposit SUI
    public entry fun deposit_sui(
        _relayer: &RelayerContract,
        payment: Coin<SUI>,
        recipient: address,
        _ctx: &mut TxContext
    ) {
        transfer::public_transfer(payment, recipient);
    }
}