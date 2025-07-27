use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct SimpleRelayer {
    pub owner: AccountId,
    pub orders: UnorderedMap<String, String>,
    pub order_count: u64,
}

#[near_bindgen]
impl SimpleRelayer {
    #[init]
    pub fn new() -> Self {
        Self {
            owner: env::predecessor_account_id(),
            orders: UnorderedMap::new(b"o"),
            order_count: 0,
        }
    }

    pub fn create_order(&mut self, dest_chain: String, amount: U128) -> String {
        self.order_count += 1;
        let order_id = format!("order_{}", self.order_count);
        let order_data = format!(
            "{}:{}:{}:{}",
            env::predecessor_account_id(),
            dest_chain,
            amount.0,
            env::block_timestamp()
        );
        
        self.orders.insert(&order_id, &order_data);
        
        env::log_str(&format!("Order created: {} - {}", order_id, order_data));
        order_id
    }

    pub fn get_order(&self, order_id: String) -> Option<String> {
        self.orders.get(&order_id)
    }

    pub fn get_order_count(&self) -> u64 {
        self.order_count
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_create_order() {
        let mut contract = SimpleRelayer::new();
        let order_id = contract.create_order("base-sepolia".to_string(), U128(1000));
        assert_eq!(order_id, "order_1");
        assert_eq!(contract.get_order_count(), 1);
    }
}