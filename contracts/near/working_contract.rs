use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{env, near_bindgen, setup_alloc, AccountId, PanicOnDefault};

setup_alloc!();

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize, PanicOnDefault)]
pub struct WorkingContract {
    pub greeting: String,
}

#[near_bindgen]
impl WorkingContract {
    #[init]
    pub fn new() -> Self {
        Self {
            greeting: "Hello World".to_string(),
        }
    }

    pub fn get_greeting(&self) -> String {
        self.greeting.clone()
    }

    pub fn set_greeting(&mut self, message: String) {
        env::log(&format!("Setting greeting: {}", message).into_bytes());
        self.greeting = message;
    }
}