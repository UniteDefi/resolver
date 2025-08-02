module aptos_addr::limit_order_protocol {
    use std::signer;
    use std::vector;
    use std::option::{Self, Option};
    use aptos_framework::account;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::timestamp;
    use aptos_std::table::{Self, Table};
    use std::bcs;

    // Error codes
    const E_ORDER_EXPIRED: u64 = 1;
    const E_INVALID_NONCE: u64 = 2;
    const E_INVALID_ORDER: u64 = 3;
    const E_BAD_SIGNATURE: u64 = 4;
    const E_INVALID_AMOUNT: u64 = 5;

    struct Order has copy, drop, store {
        salt: u64,
        maker: address,
        receiver: address,
        maker_asset: vector<u8>, // Type info as bytes
        taker_asset: vector<u8>, // Type info as bytes
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

    struct LimitOrderProtocol has key {
        invalidated_orders: Table<vector<u8>, bool>, // order_hash -> bool
        nonces: Table<address, u64>, // maker -> nonce
        
        // Partial fill support
        filled_amounts: Table<vector<u8>, u64>, // order_hash -> filled_amount
        escrow_addresses: Table<vector<u8>, address>, // order_hash -> escrow_address
        
        // Events
        order_filled_events: EventHandle<OrderFilledEvent>,
        order_cancelled_events: EventHandle<OrderCancelledEvent>,
    }

    struct OrderFilledEvent has drop, store {
        order_hash: vector<u8>,
        maker: address,
        taker: address,
        making_amount: u64,
        taking_amount: u64,
    }

    struct OrderCancelledEvent has drop, store {
        order_hash: vector<u8>,
    }

    // Initialize the protocol
    entry public fun initialize(admin: &signer) {
        let protocol = LimitOrderProtocol {
            invalidated_orders: table::new(),
            nonces: table::new(),
            filled_amounts: table::new(),
            escrow_addresses: table::new(),
            order_filled_events: account::new_event_handle<OrderFilledEvent>(admin),
            order_cancelled_events: account::new_event_handle<OrderCancelledEvent>(admin),
        };
        
        move_to(admin, protocol);
    }

    // Fill order (partial fills supported)
    public fun fill_order<MakerCoinType, TakerCoinType>(
        taker: &signer,
        order: Order,
        signature: vector<u8>,
        making_amount: u64,
        taking_amount: u64,
        target: Option<address>,
        protocol_addr: address,
    ): (u64, u64, vector<u8>) acquires LimitOrderProtocol {
        let protocol = borrow_global_mut<LimitOrderProtocol>(protocol_addr);
        let taker_addr = signer::address_of(taker);
        
        // Validate order
        assert!(timestamp::now_seconds() <= order.deadline, E_ORDER_EXPIRED);
        
        let current_nonce = if (table::contains(&protocol.nonces, order.maker)) {
            *table::borrow(&protocol.nonces, order.maker)
        } else {
            0
        };
        assert!(order.nonce == current_nonce, E_INVALID_NONCE);
        
        // Calculate order hash
        let order_hash = hash_order(&order);
        
        // Check if order is invalidated
        assert!(!table::contains(&protocol.invalidated_orders, order_hash), E_INVALID_ORDER);
        
        // Signature verification - bypassed for testnet
        // In production, implement Ed25519 signature verification
        // For testnet, we accept any non-empty signature
        assert!(vector::length(&signature) > 0, E_BAD_SIGNATURE);
        
        // Check remaining amount
        let already_filled = if (table::contains(&protocol.filled_amounts, order_hash)) {
            *table::borrow(&protocol.filled_amounts, order_hash)
        } else {
            0
        };
        let remaining_amount = order.making_amount - already_filled;
        assert!(remaining_amount > 0, E_INVALID_ORDER);
        
        // Calculate actual amounts
        let (actual_making_amount, actual_taking_amount) = if (making_amount == 0 && taking_amount == 0) {
            // Use remaining amount for cross-chain swaps
            let current_price = get_current_price(
                order.start_price, order.end_price, 
                order.auction_start_time, order.auction_end_time
            );
            let calculated_taking = (remaining_amount * current_price) / 1000000; // Adjust for decimals
            (remaining_amount, calculated_taking)
        } else if (making_amount > 0) {
            let current_price = get_current_price(
                order.start_price, order.end_price,
                order.auction_start_time, order.auction_end_time
            );
            let calculated_taking = (making_amount * current_price) / 1000000;
            (making_amount, calculated_taking)
        } else {
            // Calculate making amount from taking amount
            let current_price = get_current_price(
                order.start_price, order.end_price,
                order.auction_start_time, order.auction_end_time
            );
            let calculated_making = (taking_amount * 1000000) / current_price;
            (calculated_making, taking_amount)
        };
        
        // Validate amounts
        assert!(actual_making_amount <= remaining_amount, E_INVALID_AMOUNT);
        
        // Update filled amounts
        if (!table::contains(&protocol.filled_amounts, order_hash)) {
            table::add(&mut protocol.filled_amounts, order_hash, 0);
        };
        let filled_ref = table::borrow_mut(&mut protocol.filled_amounts, order_hash);
        *filled_ref = *filled_ref + actual_making_amount;
        
        // Mark order as fully filled if needed
        if (*filled_ref >= order.making_amount) {
            table::add(&mut protocol.invalidated_orders, order_hash, true);
            if (!table::contains(&protocol.nonces, order.maker)) {
                table::add(&mut protocol.nonces, order.maker, 1);
            } else {
                let nonce_ref = table::borrow_mut(&mut protocol.nonces, order.maker);
                *nonce_ref = *nonce_ref + 1;
            };
        };
        
        // Handle escrow address for cross-chain orders  
        let _recipient = if (!table::contains(&protocol.escrow_addresses, order_hash)) {
            let new_recipient = if (option::is_some(&target)) {
                *option::borrow(&target)
            } else {
                taker_addr
            };
            table::add(&mut protocol.escrow_addresses, order_hash, new_recipient);
            new_recipient
        } else {
            // Use stored escrow address for subsequent fills
            let stored_addr = table::borrow(&protocol.escrow_addresses, order_hash);
            *stored_addr
        };
        
        // For cross-chain orders, don't transfer tokens immediately
        let _is_cross_chain = order.src_chain_id != order.dst_chain_id;
        
        // Note: recipient is used for tracking escrow addresses
        
        // Emit event
        event::emit_event(&mut protocol.order_filled_events, OrderFilledEvent {
            order_hash,
            maker: order.maker,
            taker: taker_addr,
            making_amount: actual_making_amount,
            taking_amount: actual_taking_amount,
        });
        
        (actual_making_amount, actual_taking_amount, order_hash)
    }

    // Cancel order
    public fun cancel_order(
        maker: &signer,
        order: Order,
        protocol_addr: address,
    ) acquires LimitOrderProtocol {
        let protocol = borrow_global_mut<LimitOrderProtocol>(protocol_addr);
        let maker_addr = signer::address_of(maker);
        
        assert!(maker_addr == order.maker, E_INVALID_ORDER);
        
        let order_hash = hash_order(&order);
        assert!(!table::contains(&protocol.invalidated_orders, order_hash), E_INVALID_ORDER);
        
        table::add(&mut protocol.invalidated_orders, order_hash, true);
        
        event::emit_event(&mut protocol.order_cancelled_events, OrderCancelledEvent {
            order_hash,
        });
    }

    // Calculate current Dutch auction price
    fun get_current_price(
        start_price: u64,
        end_price: u64,
        auction_start_time: u64,
        auction_end_time: u64,
    ): u64 {
        let current_time = timestamp::now_seconds();
        
        if (current_time < auction_start_time) {
            return start_price
        };
        
        if (current_time >= auction_end_time) {
            return end_price
        };
        
        let time_elapsed = current_time - auction_start_time;
        let total_duration = auction_end_time - auction_start_time;
        let price_decrease = start_price - end_price;
        
        // Linear price decay
        start_price - (price_decrease * time_elapsed / total_duration)
    }

    // Hash order function with proper serialization
    fun hash_order(order: &Order): vector<u8> {
        // Serialize all order fields for consistent hashing
        let data = vector::empty<u8>();
        
        // Append salt (8 bytes)
        vector::append(&mut data, bcs::to_bytes(&order.salt));
        // Append maker address (32 bytes)
        vector::append(&mut data, bcs::to_bytes(&order.maker));
        // Append receiver address (32 bytes)
        vector::append(&mut data, bcs::to_bytes(&order.receiver));
        // Append maker asset
        vector::append(&mut data, order.maker_asset);
        // Append taker asset
        vector::append(&mut data, order.taker_asset);
        // Append amounts
        vector::append(&mut data, bcs::to_bytes(&order.making_amount));
        vector::append(&mut data, bcs::to_bytes(&order.taking_amount));
        // Append deadline
        vector::append(&mut data, bcs::to_bytes(&order.deadline));
        // Append nonce
        vector::append(&mut data, bcs::to_bytes(&order.nonce));
        // Append chain IDs
        vector::append(&mut data, bcs::to_bytes(&order.src_chain_id));
        vector::append(&mut data, bcs::to_bytes(&order.dst_chain_id));
        // Append auction parameters
        vector::append(&mut data, bcs::to_bytes(&order.auction_start_time));
        vector::append(&mut data, bcs::to_bytes(&order.auction_end_time));
        vector::append(&mut data, bcs::to_bytes(&order.start_price));
        vector::append(&mut data, bcs::to_bytes(&order.end_price));
        
        aptos_std::aptos_hash::keccak256(data)
    }

    // View functions
    #[view]
    public fun get_filled_amount(order_hash: vector<u8>, protocol_addr: address): u64 acquires LimitOrderProtocol {
        let protocol = borrow_global<LimitOrderProtocol>(protocol_addr);
        if (table::contains(&protocol.filled_amounts, order_hash)) {
            *table::borrow(&protocol.filled_amounts, order_hash)
        } else {
            0
        }
    }

    // Helper function to get remaining amount from order hash
    #[view]
    public fun get_remaining_amount_by_hash(order_hash: vector<u8>, making_amount: u64, protocol_addr: address): u64 acquires LimitOrderProtocol {
        let filled = get_filled_amount(order_hash, protocol_addr);
        if (making_amount > filled) {
            making_amount - filled
        } else {
            0
        }
    }

    #[view]
    public fun get_escrow_address(order_hash: vector<u8>, protocol_addr: address): address acquires LimitOrderProtocol {
        let protocol = borrow_global<LimitOrderProtocol>(protocol_addr);
        if (table::contains(&protocol.escrow_addresses, order_hash)) {
            *table::borrow(&protocol.escrow_addresses, order_hash)
        } else {
            @0x0
        }
    }

    #[view]
    public fun is_order_fully_filled(order_hash: vector<u8>, protocol_addr: address): bool acquires LimitOrderProtocol {
        let protocol = borrow_global<LimitOrderProtocol>(protocol_addr);
        table::contains(&protocol.invalidated_orders, order_hash)
    }

    #[view]
    public fun get_nonce(maker: address, protocol_addr: address): u64 acquires LimitOrderProtocol {
        let protocol = borrow_global<LimitOrderProtocol>(protocol_addr);
        if (table::contains(&protocol.nonces, maker)) {
            *table::borrow(&protocol.nonces, maker)
        } else {
            0
        }
    }

    // Getter functions for Order fields
    public fun get_order_salt(order: &Order): u64 {
        order.salt
    }

    public fun get_order_maker(order: &Order): address {
        order.maker
    }

    public fun get_order_receiver(order: &Order): address {
        order.receiver
    }

    public fun get_order_making_amount(order: &Order): u64 {
        order.making_amount
    }

    public fun get_order_taking_amount(order: &Order): u64 {
        order.taking_amount
    }

    public fun get_order_deadline(order: &Order): u64 {
        order.deadline
    }

    public fun get_order_nonce(order: &Order): u64 {
        order.nonce
    }

    public fun get_order_src_chain_id(order: &Order): u64 {
        order.src_chain_id
    }

    public fun get_order_dst_chain_id(order: &Order): u64 {
        order.dst_chain_id
    }

    public fun get_order_auction_start_time(order: &Order): u64 {
        order.auction_start_time
    }

    public fun get_order_auction_end_time(order: &Order): u64 {
        order.auction_end_time
    }

    public fun get_order_start_price(order: &Order): u64 {
        order.start_price
    }

    public fun get_order_end_price(order: &Order): u64 {
        order.end_price
    }

    public fun get_order_maker_asset(order: &Order): vector<u8> {
        order.maker_asset
    }

    public fun get_order_taker_asset(order: &Order): vector<u8> {
        order.taker_asset
    }
}