use near_sdk::store::LookupMap;
use near_sdk::{env, log, near, BorshStorageKey};

#[derive(BorshStorageKey)]
#[near]
struct OrdersKey;

#[near(contract_state)]
pub struct MinimalRelayer {
    orders: LookupMap<String, String>,
    order_count: u64,
}

impl Default for MinimalRelayer {
    fn default() -> Self {
        Self { 
            orders: LookupMap::new(OrdersKey),
            order_count: 0,
        }
    }
}

#[near]
impl MinimalRelayer {
    pub fn create_order(&mut self, dest_chain: String, amount: String) -> String {
        let order_id = format!("order_{}", env::block_timestamp());
        log!("Creating order: {} for {} on {}", order_id, amount, dest_chain);
        self.orders.insert(order_id.clone(), amount);
        self.order_count += 1;
        order_id
    }

    pub fn get_order(&self, order_id: String) -> Option<&String> {
        self.orders.get(&order_id)
    }

    pub fn get_order_count(&self) -> u64 {
        self.order_count
    }
}