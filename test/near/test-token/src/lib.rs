use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::{env, near_bindgen, AccountId, Balance, Promise, NearToken, Gas};

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct TestToken {
    pub total_supply: Balance,
    pub balances: LookupMap<AccountId, Balance>,
    pub name: String,
    pub symbol: String,
    pub decimals: u8,
}

impl Default for TestToken {
    fn default() -> Self {
        Self {
            total_supply: 0,
            balances: LookupMap::new(b"b"),
            name: "Test Token".to_string(),
            symbol: "TEST".to_string(),
            decimals: 24,
        }
    }
}

#[near_bindgen]
impl TestToken {
    #[init]
    pub fn new(name: String, symbol: String, decimals: u8) -> Self {
        Self {
            total_supply: 0,
            balances: LookupMap::new(b"b"),
            name,
            symbol,
            decimals,
        }
    }

    pub fn mint(&mut self, account_id: AccountId, amount: U128) {
        let amount = amount.0;
        self.total_supply += amount;
        let balance = self.balances.get(&account_id).unwrap_or(0);
        self.balances.insert(&account_id, &(balance + amount));
    }

    pub fn ft_transfer(&mut self, receiver_id: AccountId, amount: U128, memo: Option<String>) {
        let sender = env::predecessor_account_id();
        let amount = amount.0;
        
        let sender_balance = self.balances.get(&sender).expect("Sender not registered");
        assert!(sender_balance >= amount, "Insufficient balance");
        
        self.balances.insert(&sender, &(sender_balance - amount));
        
        let receiver_balance = self.balances.get(&receiver_id).unwrap_or(0);
        self.balances.insert(&receiver_id, &(receiver_balance + amount));
        
        if let Some(memo) = memo {
            env::log_str(&format!("Transfer {} from {} to {} memo: {}", amount, sender, receiver_id, memo));
        }
    }

    pub fn ft_transfer_call(
        &mut self,
        receiver_id: AccountId,
        amount: U128,
        memo: Option<String>,
        msg: String,
    ) -> Promise {
        self.ft_transfer(receiver_id.clone(), amount, memo);
        
        Promise::new(receiver_id).function_call(
            "ft_on_transfer".to_string(),
            format!(
                r#"{{"sender_id":"{}","amount":"{}","msg":"{}"}}"#,
                env::predecessor_account_id(),
                amount.0,
                msg
            ).into_bytes(),
            NearToken::from_yoctonear(0),
            Gas::from_tgas(10),
        )
    }

    pub fn ft_balance_of(&self, account_id: AccountId) -> U128 {
        U128(self.balances.get(&account_id).unwrap_or(0))
    }

    pub fn ft_total_supply(&self) -> U128 {
        U128(self.total_supply)
    }

    pub fn ft_metadata(&self) -> FungibleTokenMetadata {
        FungibleTokenMetadata {
            spec: "ft-1.0.0".to_string(),
            name: self.name.clone(),
            symbol: self.symbol.clone(),
            icon: None,
            reference: None,
            reference_hash: None,
            decimals: self.decimals,
        }
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct FungibleTokenMetadata {
    pub spec: String,
    pub name: String,
    pub symbol: String,
    pub icon: Option<String>,
    pub reference: Option<String>,
    pub reference_hash: Option<String>,
    pub decimals: u8,
}