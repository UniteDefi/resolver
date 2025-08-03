module unite::order_hash {
    use std::vector;
    use std::bcs;
    use sui::hash;
    
    /// Order structure matching EVM's IUniteOrder.Order
    public struct Order has copy, drop {
        salt: u256,
        maker: address,
        receiver: address,
        maker_asset: address,
        taker_asset: address,
        making_amount: u256,
        taking_amount: u256,
        deadline: u256,
        nonce: u256,
        src_chain_id: u256,
        dst_chain_id: u256,
        auction_start_time: u256,
        auction_end_time: u256,
        start_price: u256,
        end_price: u256,
    }
    
    /// EIP-712 compatible order type hash
    const ORDER_TYPEHASH: vector<u8> = b"Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 deadline,uint256 nonce,uint256 srcChainId,uint256 dstChainId,uint256 auctionStartTime,uint256 auctionEndTime,uint256 startPrice,uint256 endPrice)";
    
    /// Create a new order
    public fun new_order(
        salt: u256,
        maker: address,
        receiver: address,
        maker_asset: address,
        taker_asset: address,
        making_amount: u256,
        taking_amount: u256,
        deadline: u256,
        nonce: u256,
        src_chain_id: u256,
        dst_chain_id: u256,
        auction_start_time: u256,
        auction_end_time: u256,
        start_price: u256,
        end_price: u256,
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
    
    /// Hash an order in EIP-712 compatible way
    /// This ensures the hash matches the EVM implementation
    public fun hash_order(order: &Order): vector<u8> {
        // First, hash the type string
        let type_hash = hash::keccak256(&ORDER_TYPEHASH);
        
        // Create a vector to hold all encoded values
        let mut encoded = vector::empty<u8>();
        
        // Append type hash
        vector::append(&mut encoded, type_hash);
        
        // Encode and append each field as 32-byte value
        append_u256(&mut encoded, order.salt);
        append_address(&mut encoded, order.maker);
        append_address(&mut encoded, order.receiver);
        append_address(&mut encoded, order.maker_asset);
        append_address(&mut encoded, order.taker_asset);
        append_u256(&mut encoded, order.making_amount);
        append_u256(&mut encoded, order.taking_amount);
        append_u256(&mut encoded, order.deadline);
        append_u256(&mut encoded, order.nonce);
        append_u256(&mut encoded, order.src_chain_id);
        append_u256(&mut encoded, order.dst_chain_id);
        append_u256(&mut encoded, order.auction_start_time);
        append_u256(&mut encoded, order.auction_end_time);
        append_u256(&mut encoded, order.start_price);
        append_u256(&mut encoded, order.end_price);
        
        // Return keccak256 of the encoded data
        hash::keccak256(&encoded)
    }
    
    /// Append u256 as 32 bytes (big-endian)
    fun append_u256(vec: &mut vector<u8>, value: u256) {
        let mut bytes = vector::empty<u8>();
        let mut i = 0;
        
        // Convert u256 to 32 bytes (big-endian)
        while (i < 32) {
            let shift = (31 - i) * 8;
            let byte = ((value >> shift) & 0xFF) as u8;
            vector::push_back(&mut bytes, byte);
            i = i + 1;
        };
        
        vector::append(vec, bytes);
    }
    
    /// Append address as 32 bytes (12 bytes of zeros + 20 bytes address)
    fun append_address(vec: &mut vector<u8>, addr: address) {
        // Add 12 bytes of zeros for padding
        let mut i = 0;
        while (i < 12) {
            vector::push_back(vec, 0u8);
            i = i + 1;
        };
        
        // Convert address to bytes and append
        let addr_bytes = bcs::to_bytes(&addr);
        // Skip the length prefix if present
        let start_idx = if (vector::length(&addr_bytes) > 20) { 
            vector::length(&addr_bytes) - 20 
        } else { 
            0 
        };
        
        i = start_idx;
        while (i < vector::length(&addr_bytes)) {
            vector::push_back(vec, *vector::borrow(&addr_bytes, i));
            i = i + 1;
        };
    }
    
    // Getter functions
    public fun get_salt(order: &Order): u256 { order.salt }
    public fun get_maker(order: &Order): address { order.maker }
    public fun get_receiver(order: &Order): address { order.receiver }
    public fun get_maker_asset(order: &Order): address { order.maker_asset }
    public fun get_taker_asset(order: &Order): address { order.taker_asset }
    public fun get_making_amount(order: &Order): u256 { order.making_amount }
    public fun get_taking_amount(order: &Order): u256 { order.taking_amount }
    public fun get_deadline(order: &Order): u256 { order.deadline }
    public fun get_nonce(order: &Order): u256 { order.nonce }
    public fun get_src_chain_id(order: &Order): u256 { order.src_chain_id }
    public fun get_dst_chain_id(order: &Order): u256 { order.dst_chain_id }
    public fun get_auction_start_time(order: &Order): u256 { order.auction_start_time }
    public fun get_auction_end_time(order: &Order): u256 { order.auction_end_time }
    public fun get_start_price(order: &Order): u256 { order.start_price }
    public fun get_end_price(order: &Order): u256 { order.end_price }
}