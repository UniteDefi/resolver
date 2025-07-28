use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{near_bindgen, PanicOnDefault};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct EmptyContract {}

#[near_bindgen]
impl EmptyContract {
    #[init]
    pub fn new() -> Self {
        Self {}
    }

    pub fn ping(&self) -> String {
        "pong".to_string()
    }
}