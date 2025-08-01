use near_sdk::{log, near_bindgen, env};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct Counter {
    value: u64,
}

impl Default for Counter {
    fn default() -> Self {
        Self {
            value: 0,
        }
    }
}

#[near_bindgen]
impl Counter {
    pub fn increment(&mut self) {
        self.value += 1;
        log!("Counter incremented to: {}", self.value);
    }

    pub fn decrement(&mut self) {
        if self.value > 0 {
            self.value -= 1;
            log!("Counter decremented to: {}", self.value);
        } else {
            env::panic_str("Counter cannot go below zero");
        }
    }

    pub fn get_value(&self) -> u64 {
        log!("Current counter value: {}", self.value);
        self.value
    }

    pub fn reset(&mut self) {
        self.value = 0;
        log!("Counter reset to zero");
    }
}