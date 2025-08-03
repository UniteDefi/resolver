use sha2::{Digest, Sha256};
use crate::types::Order;

/// Calculate order hash compatible with EVM implementation
pub fn calculate_order_hash(order: &Order) -> String {
    // Create normalized values for consistent hashing across chains
    let maker_normalized = normalize_address(&order.maker.to_string());
    let receiver_normalized = match &order.receiver {
        Some(addr) => normalize_address(&addr.to_string()),
        None => "0x0000000000000000000000000000000000000000".to_string(),
    };
    
    // Normalize chain IDs
    let src_chain_normalized = normalize_chain_id_for_hash(order.src_chain_id);
    let dst_chain_normalized = normalize_chain_id_for_hash(order.dst_chain_id);
    
    // Create structured data for hashing (matching EVM's abi.encode)
    let mut hasher = Sha256::new();
    
    // Add each field in the same order as EVM struct
    hasher.update(&order.salt.u128().to_be_bytes());
    hasher.update(hex::decode(&maker_normalized[2..]).unwrap()); // Remove 0x prefix
    hasher.update(hex::decode(&receiver_normalized[2..]).unwrap());
    hasher.update(normalize_token(&order.maker_asset).as_bytes());
    hasher.update(normalize_token(&order.taker_asset).as_bytes());
    hasher.update(&order.making_amount.u128().to_be_bytes());
    hasher.update(&order.taking_amount.u128().to_be_bytes());
    hasher.update(&order.deadline.to_be_bytes());
    hasher.update(&order.nonce.u128().to_be_bytes());
    hasher.update(&src_chain_normalized.to_be_bytes());
    hasher.update(&dst_chain_normalized.to_be_bytes());
    hasher.update(&order.auction_start_time.to_be_bytes());
    hasher.update(&order.auction_end_time.to_be_bytes());
    hasher.update(&order.start_price.u128().to_be_bytes());
    hasher.update(&order.end_price.u128().to_be_bytes());
    
    hex::encode(hasher.finalize())
}

/// Normalize Osmosis address to EVM-compatible format for hashing
fn normalize_address(addr: &str) -> String {
    if addr.starts_with("osmo") {
        // For Osmosis addresses, create a deterministic EVM-style address
        // This uses the first 20 bytes of the hash of the Osmosis address
        let hash = Sha256::digest(addr.as_bytes());
        format!("0x{}", hex::encode(&hash[..20]))
    } else if addr.is_empty() || addr == "0" {
        "0x0000000000000000000000000000000000000000".to_string()
    } else {
        // Assume it's already an EVM address
        if addr.starts_with("0x") {
            addr.to_lowercase()
        } else {
            format!("0x{}", addr.to_lowercase())
        }
    }
}

/// Normalize token denomination for consistent hashing
fn normalize_token(token: &str) -> String {
    match token {
        "uosmo" => "osmo_native".to_string(),
        _ if token.starts_with("ibc/") => token.to_string(),
        _ => token.to_lowercase(),
    }
}

/// Normalize chain ID for consistent hashing
fn normalize_chain_id_for_hash(chain_id: u64) -> u64 {
    // Map known Osmosis chain IDs to consistent values
    match chain_id {
        5555 => 5555, // Osmosis testnet (osmo-test-5)
        1 => 1,       // Osmosis mainnet
        _ => chain_id,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::Addr;

    #[test]
    fn test_order_hash_consistency() {
        let order = Order {
            salt: Uint128::new(12345),
            maker: Addr::unchecked("osmo1abc123"),
            receiver: None,
            maker_asset: "uosmo".to_string(),
            taker_asset: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48".to_string(), // USDC on Ethereum
            making_amount: Uint128::new(1000000),
            taking_amount: Uint128::new(1000000),
            deadline: 1234567890,
            nonce: Uint128::new(1),
            src_chain_id: 5555,
            dst_chain_id: 1,
            auction_start_time: 1234567890,
            auction_end_time: 1234567990,
            start_price: Uint128::new(990000000000000000), // 0.99 with 18 decimals
            end_price: Uint128::new(970000000000000000),   // 0.97 with 18 decimals
        };
        
        let hash1 = calculate_order_hash(&order);
        let hash2 = calculate_order_hash(&order);
        
        assert_eq!(hash1, hash2, "Hash should be deterministic");
        assert_eq!(hash1.len(), 64, "Hash should be 32 bytes in hex");
    }
}