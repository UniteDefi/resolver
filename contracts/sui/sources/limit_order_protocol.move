module unite::limit_order_protocol {
    use std::vector;
    use std::option::{Self, Option};
    use sui::object::{Self, UID, ID};
    use sui::transfer;
    use sui::tx_context::{Self, TxContext};
    use sui::coin::{Self, Coin};
    use sui::sui::SUI;
    use sui::event;
    use sui::clock::{Self, Clock};
    use sui::table::{Self, Table};
    use sui::bcs;
    use std::hash;

    // === Errors ===
    const EOrderExpired: u64 = 1;
    const EInvalidNonce: u64 = 2;
    const EInvalidOrder: u64 = 3;
    const EBadSignature: u64 = 4;
    const EInvalidAmount: u64 = 5;
    const EOrderAlreadyFilled: u64 = 6;

    // === Structs ===
    
    /// Order structure
    public struct Order has copy, drop, store {
        salt: u64,
        maker: address,
        receiver: address,
        maker_asset: vector<u8>, // Asset type as bytes
        taker_asset: vector<u8>, // Asset type as bytes  
        making_amount: u64,
        taking_amount: u64,
        deadline: u64,
        nonce: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        auction_start_time: u64,
        auction_end_time: u64,
        start_price: u64,
        end_price: u64,
    }

    /// Limit Order Protocol state
    public struct LimitOrderProtocol has key, store {
        id: UID,
        admin: address,
        invalidated_orders: Table<vector<u8>, bool>, // order_hash -> bool
        nonces: Table<address, u64>, // maker -> nonce
        filled_amounts: Table<vector<u8>, u64>, // order_hash -> filled amount
        escrow_addresses: Table<vector<u8>, ID>, // order_hash -> escrow_id
    }

    /// Admin capability
    public struct LimitOrderProtocolAdminCap has key, store {
        id: UID,
        protocol_id: ID,
    }

    // === Events ===
    
    public struct OrderFilled has copy, drop {
        order_hash: vector<u8>,
        maker: address,
        taker: address,
        making_amount: u64,
        taking_amount: u64,
        escrow_id: Option<ID>,
    }

    public struct OrderCancelled has copy, drop {
        order_hash: vector<u8>,
        maker: address,
    }

    public struct ProtocolCreated has copy, drop {
        protocol_id: ID,
        admin: address,
    }

    // === Public Functions ===

    /// Initialize the protocol
    fun init(ctx: &mut TxContext) {
        let admin = tx_context::sender(ctx);
        
        let protocol = LimitOrderProtocol {
            id: object::new(ctx),
            admin,
            invalidated_orders: table::new(ctx),
            nonces: table::new(ctx),
            filled_amounts: table::new(ctx),
            escrow_addresses: table::new(ctx),
        };

        let protocol_id = object::id(&protocol);

        let admin_cap = LimitOrderProtocolAdminCap {
            id: object::new(ctx),
            protocol_id,
        };

        event::emit(ProtocolCreated {
            protocol_id,
            admin,
        });

        transfer::share_object(protocol);
        transfer::transfer(admin_cap, admin);
    }

    /// Create a new protocol (for testing)
    public fun create_protocol(ctx: &mut TxContext): (LimitOrderProtocol, LimitOrderProtocolAdminCap) {
        let admin = tx_context::sender(ctx);
        
        let protocol = LimitOrderProtocol {
            id: object::new(ctx),
            admin,
            invalidated_orders: table::new(ctx),
            nonces: table::new(ctx),
            filled_amounts: table::new(ctx),
            escrow_addresses: table::new(ctx),
        };

        let protocol_id = object::id(&protocol);

        let admin_cap = LimitOrderProtocolAdminCap {
            id: object::new(ctx),
            protocol_id,
        };

        event::emit(ProtocolCreated {
            protocol_id,
            admin,
        });

        (protocol, admin_cap)
    }

    /// Fill order with partial amount
    public fun fill_order(
        protocol: &mut LimitOrderProtocol,
        order: Order,
        making_amount: u64,
        taking_amount: u64,
        mut target_escrow_id: Option<ID>,
        clock: &Clock,
        ctx: &mut TxContext
    ): (u64, u64, vector<u8>) {
        // Validate order
        let current_time = clock::timestamp_ms(clock) / 1000;
        assert!(current_time <= order.deadline, EOrderExpired);
        
        let maker_nonce = get_nonce(protocol, order.maker);
        assert!(order.nonce == maker_nonce, EInvalidNonce);
        
        // Calculate order hash
        let order_hash = hash_order(&order);
        
        // Check if order is already invalidated
        assert!(!is_order_invalidated(protocol, order_hash), EInvalidOrder);
        
        // Check remaining available amount
        let already_filled = get_filled_amount(protocol, order_hash);
        let remaining_amount = order.making_amount - already_filled;
        
        assert!(remaining_amount > 0, EOrderAlreadyFilled);
        
        // Calculate actual amounts based on Dutch auction pricing
        let (actual_making_amount, actual_taking_amount) = if (making_amount == 0 && taking_amount == 0) {
            // Use remaining amount
            let making = remaining_amount;
            let taking = calculate_taking_amount(
                making,
                order.start_price,
                order.end_price,
                order.auction_start_time,
                order.auction_end_time,
                current_time
            );
            (making, taking)
        } else if (making_amount > 0) {
            let making = making_amount;
            let taking = calculate_taking_amount(
                making,
                order.start_price,
                order.end_price,
                order.auction_start_time,
                order.auction_end_time,
                current_time
            );
            (making, taking)
        } else {
            // Taking amount specified
            let current_price = get_current_price(
                order.start_price,
                order.end_price,
                order.auction_start_time,
                order.auction_end_time,
                current_time
            );
            let taking = taking_amount;
            let making = (taking * 1000000000000000000) / current_price; // 18 decimal precision
            (making, taking)
        };
        
        // Validate amounts don't exceed remaining
        assert!(actual_making_amount <= remaining_amount, EInvalidAmount);
        
        // Update filled amounts
        let new_filled = already_filled + actual_making_amount;
        if (table::contains(&protocol.filled_amounts, order_hash)) {
            let _ = table::remove(&mut protocol.filled_amounts, order_hash);
        };
        table::add(&mut protocol.filled_amounts, order_hash, new_filled);
        
        // Mark order as fully filled and increment nonce when completely consumed
        if (new_filled >= order.making_amount) {
            table::add(&mut protocol.invalidated_orders, order_hash, true);
            let new_nonce = maker_nonce + 1;
            if (table::contains(&protocol.nonces, order.maker)) {
                let _ = table::remove(&mut protocol.nonces, order.maker);
            };
            table::add(&mut protocol.nonces, order.maker, new_nonce);
        };
        
        // Handle escrow address for consistent routing
        let escrow_id = if (option::is_some(&target_escrow_id)) {
            let target_id = option::extract(&mut target_escrow_id);
            
            // For the first fill, store the escrow address
            if (!table::contains(&protocol.escrow_addresses, order_hash)) {
                table::add(&mut protocol.escrow_addresses, order_hash, target_id);
            };
            
            option::some(target_id)
        } else {
            option::none()
        };
        
        // For cross-chain orders, don't transfer tokens immediately
        // The tokens will be handled by the escrow system
        let is_cross_chain = order.src_chain_id != order.dst_chain_id;
        
        // Note: Token transfers would be handled by the escrow system
        // This is just recording the commitment
        
        event::emit(OrderFilled {
            order_hash,
            maker: order.maker,
            taker: tx_context::sender(ctx),
            making_amount: actual_making_amount,
            taking_amount: actual_taking_amount,
            escrow_id,
        });
        
        (actual_making_amount, actual_taking_amount, order_hash)
    }

    /// Cancel order
    public fun cancel_order(
        protocol: &mut LimitOrderProtocol,
        order: Order,
        ctx: &mut TxContext
    ) {
        assert!(tx_context::sender(ctx) == order.maker, EInvalidOrder);
        
        let order_hash = hash_order(&order);
        assert!(!is_order_invalidated(protocol, order_hash), EInvalidOrder);
        
        table::add(&mut protocol.invalidated_orders, order_hash, true);
        
        event::emit(OrderCancelled {
            order_hash,
            maker: order.maker,
        });
    }

    /// Set escrow address for order (used by resolvers)
    public fun set_escrow_address(
        protocol: &mut LimitOrderProtocol,
        order_hash: vector<u8>,
        escrow_id: ID,
        _ctx: &mut TxContext
    ) {
        if (!table::contains(&protocol.escrow_addresses, order_hash)) {
            table::add(&mut protocol.escrow_addresses, order_hash, escrow_id);
        };
    }

    // === Helper Functions ===
    
    /// Hash an order
    public fun hash_order(order: &Order): vector<u8> {
        // Simple hash using BCS encoding
        let encoded = bcs::to_bytes(order);
        hash::sha3_256(encoded)
    }

    /// Calculate current price in Dutch auction
    fun get_current_price(
        start_price: u64,
        end_price: u64,
        auction_start_time: u64,
        auction_end_time: u64,
        current_time: u64
    ): u64 {
        if (current_time < auction_start_time) {
            start_price
        } else if (current_time >= auction_end_time) {
            end_price
        } else {
            let time_elapsed = current_time - auction_start_time;
            let total_duration = auction_end_time - auction_start_time;
            let price_decrease = start_price - end_price;
            
            // Linear price decay
            start_price - (price_decrease * time_elapsed / total_duration)
        }
    }

    /// Calculate taking amount based on current price
    fun calculate_taking_amount(
        making_amount: u64,
        start_price: u64,
        end_price: u64,
        auction_start_time: u64,
        auction_end_time: u64,
        current_time: u64
    ): u64 {
        let current_price = get_current_price(
            start_price,
            end_price,
            auction_start_time,
            auction_end_time,
            current_time
        );
        
        // taking_amount = making_amount * current_price / 1e18
        (making_amount * current_price) / 1000000000000000000
    }

    // === View Functions ===
    
    public fun get_filled_amount(protocol: &LimitOrderProtocol, order_hash: vector<u8>): u64 {
        if (table::contains(&protocol.filled_amounts, order_hash)) {
            *table::borrow(&protocol.filled_amounts, order_hash)
        } else {
            0
        }
    }
    
    public fun get_remaining_amount(protocol: &LimitOrderProtocol, order: &Order): u64 {
        let order_hash = hash_order(order);
        let filled = get_filled_amount(protocol, order_hash);
        if (order.making_amount > filled) {
            order.making_amount - filled
        } else {
            0
        }
    }
    
    public fun get_escrow_address(protocol: &LimitOrderProtocol, order_hash: vector<u8>): Option<ID> {
        if (table::contains(&protocol.escrow_addresses, order_hash)) {
            option::some(*table::borrow(&protocol.escrow_addresses, order_hash))
        } else {
            option::none()
        }
    }
    
    public fun is_order_fully_filled(protocol: &LimitOrderProtocol, order_hash: vector<u8>): bool {
        is_order_invalidated(protocol, order_hash)
    }
    
    public fun is_order_invalidated(protocol: &LimitOrderProtocol, order_hash: vector<u8>): bool {
        table::contains(&protocol.invalidated_orders, order_hash) && 
        *table::borrow(&protocol.invalidated_orders, order_hash)
    }
    
    public fun get_nonce(protocol: &LimitOrderProtocol, maker: address): u64 {
        if (table::contains(&protocol.nonces, maker)) {
            *table::borrow(&protocol.nonces, maker)
        } else {
            0
        }
    }
    
    public fun get_protocol_admin(protocol: &LimitOrderProtocol): address {
        protocol.admin
    }

    // === Order Getters ===
    
    public fun get_making_amount(order: &Order): u64 {
        order.making_amount
    }
    
    public fun get_maker(order: &Order): address {
        order.maker
    }

    // === Order Creation Helpers ===
    
    public fun create_order(
        salt: u64,
        maker: address,
        receiver: address,
        maker_asset: vector<u8>,
        taker_asset: vector<u8>,
        making_amount: u64,
        taking_amount: u64,
        deadline: u64,
        nonce: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        auction_start_time: u64,
        auction_end_time: u64,
        start_price: u64,
        end_price: u64,
    ): Order {
        Order {
            salt,
            maker,
            receiver,
            maker_asset,
            taker_asset,
            making_amount,
            taking_amount,
            deadline,
            nonce,
            src_chain_id,
            dst_chain_id,
            auction_start_time,
            auction_end_time,
            start_price,
            end_price,
        }
    }
}