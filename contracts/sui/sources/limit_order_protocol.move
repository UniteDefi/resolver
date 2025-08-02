module protocol::limit_order_protocol {
    use sui::object::{Self, UID};
    use sui::tx_context::{Self, TxContext};
    use sui::transfer;
    use sui::event;
    use sui::table::{Self, Table};
    use sui::clock::{Self, Clock};
    use std::vector;
    use std::option::{Self, Option};

    // Error codes
    const E_INVALID_ORDER: u64 = 0;
    const E_ORDER_EXISTS: u64 = 1;
    const E_ORDER_NOT_FOUND: u64 = 2;
    const E_UNAUTHORIZED: u64 = 3;
    const E_ORDER_FILLED: u64 = 4;
    const E_ORDER_CANCELLED: u64 = 5;
    const E_INVALID_SIGNATURE: u64 = 6;
    const E_EXPIRED_ORDER: u64 = 7;

    // Order status
    const STATUS_OPEN: u8 = 0;
    const STATUS_PARTIALLY_FILLED: u8 = 1;
    const STATUS_FILLED: u8 = 2;
    const STATUS_CANCELLED: u8 = 3;

    // Protocol for managing limit orders
    struct LimitOrderProtocol has key {
        id: UID,
        orders: Table<vector<u8>, Order>,
        filled_amounts: Table<vector<u8>, u64>,
        order_count: u64,
        paused: bool,
    }

    // Order structure
    struct Order has store, copy, drop {
        // Order identification
        order_hash: vector<u8>,
        maker: address,
        
        // Asset details
        maker_asset: vector<u8>,
        taker_asset: vector<u8>,
        maker_amount: u64,
        taker_amount: u64,
        
        // Order parameters
        receiver: address,
        allowed_sender: Option<address>,
        expiry: u64,
        nonce: u64,
        
        // Cross-chain parameters
        src_chain_id: u64,
        dst_chain_id: u64,
        
        // Status
        status: u8,
        created_at: u64,
    }

    // Events
    struct OrderCreated has copy, drop {
        order_hash: vector<u8>,
        maker: address,
        maker_asset: vector<u8>,
        taker_asset: vector<u8>,
        maker_amount: u64,
        taker_amount: u64,
    }

    struct OrderFilled has copy, drop {
        order_hash: vector<u8>,
        taker: address,
        maker_amount: u64,
        taker_amount: u64,
    }

    struct OrderCancelled has copy, drop {
        order_hash: vector<u8>,
        maker: address,
    }

    // Initialize protocol
    fun init(ctx: &mut TxContext) {
        let protocol = LimitOrderProtocol {
            id: object::new(ctx),
            orders: table::new(ctx),
            filled_amounts: table::new(ctx),
            order_count: 0,
            paused: false,
        };

        transfer::share_object(protocol);
    }

    // Create a new limit order
    public fun create_order(
        protocol: &mut LimitOrderProtocol,
        order_hash: vector<u8>,
        maker: address,
        maker_asset: vector<u8>,
        taker_asset: vector<u8>,
        maker_amount: u64,
        taker_amount: u64,
        receiver: address,
        allowed_sender: Option<address>,
        expiry: u64,
        nonce: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!protocol.paused, E_UNAUTHORIZED);
        assert!(!table::contains(&protocol.orders, order_hash), E_ORDER_EXISTS);
        assert!(clock::timestamp_ms(clock) < expiry, E_EXPIRED_ORDER);

        let order = Order {
            order_hash,
            maker,
            maker_asset,
            taker_asset,
            maker_amount,
            taker_amount,
            receiver,
            allowed_sender,
            expiry,
            nonce,
            src_chain_id,
            dst_chain_id,
            status: STATUS_OPEN,
            created_at: clock::timestamp_ms(clock),
        };

        table::add(&mut protocol.orders, order_hash, order);
        table::add(&mut protocol.filled_amounts, order_hash, 0);
        protocol.order_count = protocol.order_count + 1;

        event::emit(OrderCreated {
            order_hash,
            maker,
            maker_asset,
            taker_asset,
            maker_amount,
            taker_amount,
        });
    }

    // Fill an order (partially or fully)
    public fun fill_order(
        protocol: &mut LimitOrderProtocol,
        order_hash: vector<u8>,
        maker_amount: u64,
        taker_amount: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(!protocol.paused, E_UNAUTHORIZED);
        assert!(table::contains(&protocol.orders, order_hash), E_ORDER_NOT_FOUND);

        let order = table::borrow_mut(&mut protocol.orders, order_hash);
        assert!(order.status == STATUS_OPEN || order.status == STATUS_PARTIALLY_FILLED, E_ORDER_FILLED);
        assert!(clock::timestamp_ms(clock) < order.expiry, E_EXPIRED_ORDER);

        // Check if sender is allowed
        if (option::is_some(&order.allowed_sender)) {
            assert!(tx_context::sender(ctx) == *option::borrow(&order.allowed_sender), E_UNAUTHORIZED);
        }

        // Update filled amounts
        let filled_amount = table::borrow_mut(&mut protocol.filled_amounts, order_hash);
        *filled_amount = *filled_amount + maker_amount;

        // Update order status
        if (*filled_amount >= order.maker_amount) {
            order.status = STATUS_FILLED;
        } else {
            order.status = STATUS_PARTIALLY_FILLED;
        }

        event::emit(OrderFilled {
            order_hash,
            taker: tx_context::sender(ctx),
            maker_amount,
            taker_amount,
        });
    }

    // Cancel an order
    public fun cancel_order(
        protocol: &mut LimitOrderProtocol,
        order_hash: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(table::contains(&protocol.orders, order_hash), E_ORDER_NOT_FOUND);

        let order = table::borrow_mut(&mut protocol.orders, order_hash);
        assert!(order.maker == tx_context::sender(ctx), E_UNAUTHORIZED);
        assert!(order.status == STATUS_OPEN || order.status == STATUS_PARTIALLY_FILLED, E_ORDER_FILLED);

        order.status = STATUS_CANCELLED;

        event::emit(OrderCancelled {
            order_hash,
            maker: order.maker,
        });
    }

    // View functions
    public fun get_order(protocol: &LimitOrderProtocol, order_hash: vector<u8>): &Order {
        assert!(table::contains(&protocol.orders, order_hash), E_ORDER_NOT_FOUND);
        table::borrow(&protocol.orders, order_hash)
    }

    public fun get_filled_amount(protocol: &LimitOrderProtocol, order_hash: vector<u8>): u64 {
        assert!(table::contains(&protocol.filled_amounts, order_hash), E_ORDER_NOT_FOUND);
        *table::borrow(&protocol.filled_amounts, order_hash)
    }

    public fun is_paused(protocol: &LimitOrderProtocol): bool {
        protocol.paused
    }

    public fun order_count(protocol: &LimitOrderProtocol): u64 {
        protocol.order_count
    }
}