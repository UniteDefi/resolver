use near_sdk::{near_bindgen, PanicOnDefault};
use near_sdk::borsh::{BorshDeserialize, BorshSerialize};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct MinimalContract {
    pub value: u64,
}

#[near_bindgen]
impl MinimalContract {
    #[init]
    pub fn new() -> Self {
        Self { value: 0 }
    }

    pub fn get_value(&self) -> u64 {
        self.value
    }

    pub fn set_value(&mut self, value: u64) {
        self.value = value;
    }
}