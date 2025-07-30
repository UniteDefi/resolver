use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{env, near_bindgen, setup_alloc, AccountId};

setup_alloc!();

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct BasicContract {
    greeting: String,
}

impl Default for BasicContract {
    fn default() -> Self {
        Self {
            greeting: "Hello".to_string(),
        }
    }
}

#[near_bindgen]
impl BasicContract {
    pub fn get_greeting(&self) -> String {
        return self.greeting.clone();
    }

    pub fn set_greeting(&mut self, message: String) {
        let account_id = env::signer_account_id();
        env::log_str(&format!("Saving greeting: {}", message));
        self.greeting = message;
    }
}