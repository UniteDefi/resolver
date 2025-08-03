module aptos_addr::order_hash {
    use std::vector;
    use std::bcs;
    use aptos_std::aptos_hash;

    // Constants for EVM compatibility
    const EVM_ADDRESS_LENGTH: u64 = 20;
    const UINT256_LENGTH: u64 = 32;
    
    // Order structure that matches EVM
    struct Order has copy, drop, store {
        salt: u256,
        maker: vector<u8>,        // 20 bytes EVM address
        receiver: vector<u8>,      // 20 bytes EVM address
        maker_asset: vector<u8>,   // 20 bytes EVM address
        taker_asset: vector<u8>,   // 20 bytes EVM address
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

    // EIP-712 TypeHash for Order
    const ORDER_TYPEHASH: vector<u8> = x"2a2e58b3fa8c0a01e088cf9dd0c5e8dfcc96fb966fa52f3a29e8dc8bfd3bc93b";

    // Convert u64 to u256 (big-endian 32 bytes)
    fun u64_to_u256_bytes(value: u64): vector<u8> {
        let bytes = vector::empty<u8>();
        let i = 0;
        // Add 24 zero bytes for padding
        while (i < 24) {
            vector::push_back(&mut bytes, 0);
            i = i + 1;
        };
        // Add the u64 as 8 bytes (big-endian)
        let j = 8;
        while (j > 0) {
            let byte = ((value >> ((j - 1) * 8)) & 0xFF) as u8;
            vector::push_back(&mut bytes, byte);
            j = j - 1;
        };
        bytes
    }

    // Convert address to EVM-compatible 20-byte format
    public fun address_to_evm_bytes(addr: address): vector<u8> {
        let addr_bytes = bcs::to_bytes(&addr);
        let evm_bytes = vector::empty<u8>();
        
        // Aptos addresses are 32 bytes, take last 20 bytes for EVM compatibility
        let start = if (vector::length(&addr_bytes) > 20) {
            vector::length(&addr_bytes) - 20
        } else {
            0
        };
        
        let i = start;
        while (i < vector::length(&addr_bytes) && vector::length(&evm_bytes) < 20) {
            vector::push_back(&mut evm_bytes, *vector::borrow(&addr_bytes, i));
            i = i + 1;
        };
        
        // Pad with zeros if needed
        while (vector::length(&evm_bytes) < 20) {
            vector::push_back(&mut evm_bytes, 0);
        };
        
        evm_bytes
    }

    // Hash order in EVM-compatible way
    public fun hash_order_evm_compatible(
        salt: u64,
        maker: address,
        receiver: address,
        maker_asset: address,
        taker_asset: address,
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
    ): vector<u8> {
        // Create encoded data matching EVM's abi.encode
        let encoded = vector::empty<u8>();
        
        // Add ORDER_TYPEHASH
        vector::append(&mut encoded, ORDER_TYPEHASH);
        
        // Add all fields as 32-byte values
        vector::append(&mut encoded, u64_to_u256_bytes(salt));
        
        // Addresses need to be padded to 32 bytes
        let maker_evm = address_to_evm_bytes(maker);
        let i = 0;
        while (i < 12) {
            vector::push_back(&mut encoded, 0);
            i = i + 1;
        };
        vector::append(&mut encoded, maker_evm);
        
        let receiver_evm = address_to_evm_bytes(receiver);
        i = 0;
        while (i < 12) {
            vector::push_back(&mut encoded, 0);
            i = i + 1;
        };
        vector::append(&mut encoded, receiver_evm);
        
        let maker_asset_evm = address_to_evm_bytes(maker_asset);
        i = 0;
        while (i < 12) {
            vector::push_back(&mut encoded, 0);
            i = i + 1;
        };
        vector::append(&mut encoded, maker_asset_evm);
        
        let taker_asset_evm = address_to_evm_bytes(taker_asset);
        i = 0;
        while (i < 12) {
            vector::push_back(&mut encoded, 0);
            i = i + 1;
        };
        vector::append(&mut encoded, taker_asset_evm);
        
        vector::append(&mut encoded, u64_to_u256_bytes(making_amount));
        vector::append(&mut encoded, u64_to_u256_bytes(taking_amount));
        vector::append(&mut encoded, u64_to_u256_bytes(deadline));
        vector::append(&mut encoded, u64_to_u256_bytes(nonce));
        vector::append(&mut encoded, u64_to_u256_bytes(src_chain_id));
        vector::append(&mut encoded, u64_to_u256_bytes(dst_chain_id));
        vector::append(&mut encoded, u64_to_u256_bytes(auction_start_time));
        vector::append(&mut encoded, u64_to_u256_bytes(auction_end_time));
        vector::append(&mut encoded, u64_to_u256_bytes(start_price));
        vector::append(&mut encoded, u64_to_u256_bytes(end_price));
        
        // Return keccak256 hash
        aptos_hash::keccak256(encoded)
    }

    // Create order struct
    public fun create_order(
        salt: u64,
        maker: address,
        receiver: address,
        maker_asset: address,
        taker_asset: address,
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
            salt: (salt as u256),
            maker: address_to_evm_bytes(maker),
            receiver: address_to_evm_bytes(receiver),
            maker_asset: address_to_evm_bytes(maker_asset),
            taker_asset: address_to_evm_bytes(taker_asset),
            making_amount: (making_amount as u256),
            taking_amount: (taking_amount as u256),
            deadline: (deadline as u256),
            nonce: (nonce as u256),
            src_chain_id: (src_chain_id as u256),
            dst_chain_id: (dst_chain_id as u256),
            auction_start_time: (auction_start_time as u256),
            auction_end_time: (auction_end_time as u256),
            start_price: (start_price as u256),
            end_price: (end_price as u256),
        }
    }
}