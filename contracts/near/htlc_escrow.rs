use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::store::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, AccountId, Balance, Gas, PanicOnDefault, Promise, Timestamp};

pub const TGAS: u64 = 1_000_000_000_000;
pub const NO_DEPOSIT: Balance = 0;
pub const SAFETY_DEPOSIT: Balance = 1_000_000_000_000_000_000_000; // 0.001 NEAR

pub const GAS_FOR_TRANSFER: Gas = Gas::from_tgas(10);
pub const GAS_FOR_WITHDRAW_CALLBACK: Gas = Gas::from_tgas(20);
pub const GAS_FOR_CANCEL_CALLBACK: Gas = Gas::from_tgas(20);

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct HTLC {
    pub hashlock: String,
    pub sender: AccountId,
    pub receiver: AccountId,
    pub token: Option<AccountId>, // None means NEAR
    pub amount: U128,
    pub timeout: Timestamp,
    pub status: HTLCStatus,
    pub secret: Option<String>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub enum HTLCStatus {
    Active,
    Withdrawn,
    Cancelled,
    Processing, // For async operations
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct HTLCCreatedEvent {
    pub hashlock: String,
    pub sender: AccountId,
    pub receiver: AccountId,
    pub token: Option<AccountId>,
    pub amount: U128,
    pub timeout: Timestamp,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct HTLCWithdrawnEvent {
    pub hashlock: String,
    pub secret: String,
    pub receiver: AccountId,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct HTLCCancelledEvent {
    pub hashlock: String,
    pub sender: AccountId,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct HTLCEscrow {
    htlcs: LookupMap<String, HTLC>,
    token_balances: LookupMap<AccountId, Balance>,
    near_balance: Balance,
}

#[near]
impl HTLCEscrow {
    #[init]
    pub fn new() -> Self {
        Self {
            htlcs: LookupMap::new(b"h"),
            token_balances: LookupMap::new(b"t"),
            near_balance: 0,
        }
    }

    #[payable]
    pub fn create_htlc(
        &mut self,
        hashlock: String,
        receiver: AccountId,
        token: Option<AccountId>,
        amount: U128,
        timeout: Timestamp,
    ) -> Promise {
        assert!(
            self.htlcs.get(&hashlock).is_none(),
            "HTLC already exists"
        );
        assert!(timeout > env::block_timestamp(), "Timeout must be in future");

        let htlc = HTLC {
            hashlock: hashlock.clone(),
            sender: env::predecessor_account_id(),
            receiver: receiver.clone(),
            token: token.clone(),
            amount,
            timeout,
            status: HTLCStatus::Active,
            secret: None,
        };

        self.htlcs.insert(&hashlock, &htlc);

        let event = HTLCCreatedEvent {
            hashlock: hashlock.clone(),
            sender: env::predecessor_account_id(),
            receiver,
            token: token.clone(),
            amount,
            timeout,
        };
        env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap()));

        match token {
            None => {
                // NEAR token
                let total_required = amount.0 + SAFETY_DEPOSIT;
                assert!(
                    env::attached_deposit() >= total_required,
                    "Insufficient NEAR deposit"
                );
                
                self.near_balance += amount.0 + SAFETY_DEPOSIT;
                
                // Return excess deposit
                let excess = env::attached_deposit() - total_required;
                if excess > 0 {
                    Promise::new(env::predecessor_account_id()).transfer(excess)
                } else {
                    Promise::new(env::current_account_id()).function_call(
                        "noop".to_string(),
                        b"".to_vec(),
                        NO_DEPOSIT,
                        Gas::from_tgas(1),
                    )
                }
            }
            Some(token_id) => {
                // Fungible token
                assert!(
                    env::attached_deposit() >= SAFETY_DEPOSIT,
                    "Safety deposit required"
                );
                
                self.near_balance += SAFETY_DEPOSIT;
                
                // Return excess deposit
                let excess = env::attached_deposit() - SAFETY_DEPOSIT;
                let refund_promise = if excess > 0 {
                    Promise::new(env::predecessor_account_id()).transfer(excess)
                } else {
                    Promise::new(env::current_account_id()).function_call(
                        "noop".to_string(),
                        b"".to_vec(),
                        NO_DEPOSIT,
                        Gas::from_tgas(1),
                    )
                };
                
                // Transfer tokens from sender
                refund_promise.then(
                    Promise::new(token_id).function_call(
                        "ft_transfer_call".to_string(),
                        serde_json::json!({
                            "receiver_id": env::current_account_id(),
                            "amount": amount,
                            "msg": hashlock
                        })
                        .to_string()
                        .into_bytes(),
                        1, // 1 yoctoNEAR
                        GAS_FOR_TRANSFER,
                    )
                )
            }
        }
    }

    pub fn withdraw(&mut self, secret: String, hashlock: String) -> Promise {
        let mut htlc = self.htlcs.get(&hashlock).expect("HTLC not found");
        
        assert_eq!(htlc.status, HTLCStatus::Active, "HTLC not active");
        assert!(
            env::block_timestamp() < htlc.timeout,
            "HTLC timeout reached"
        );
        
        // Verify secret
        let computed_hash = self.hash_secret(&secret);
        assert_eq!(computed_hash, hashlock, "Invalid secret");
        
        // Update status to processing
        htlc.status = HTLCStatus::Processing;
        htlc.secret = Some(secret.clone());
        self.htlcs.insert(&hashlock, &htlc);
        
        // Prepare transfer based on token type
        match &htlc.token {
            None => {
                // NEAR transfer
                self.near_balance -= htlc.amount.0 + SAFETY_DEPOSIT;
                Promise::new(htlc.receiver.clone())
                    .transfer(htlc.amount.0 + SAFETY_DEPOSIT)
                    .then(
                        Promise::new(env::current_account_id()).function_call(
                            "withdraw_callback".to_string(),
                            serde_json::json!({
                                "hashlock": hashlock,
                                "success": true
                            })
                            .to_string()
                            .into_bytes(),
                            NO_DEPOSIT,
                            GAS_FOR_WITHDRAW_CALLBACK,
                        )
                    )
            }
            Some(token_id) => {
                // Fungible token transfer
                self.near_balance -= SAFETY_DEPOSIT;
                let current_balance = self.token_balances.get(token_id).unwrap_or(0);
                self.token_balances.insert(token_id, &(current_balance - htlc.amount.0));
                
                Promise::new(token_id.clone()).function_call(
                    "ft_transfer".to_string(),
                    serde_json::json!({
                        "receiver_id": htlc.receiver.clone(),
                        "amount": htlc.amount
                    })
                    .to_string()
                    .into_bytes(),
                    1, // 1 yoctoNEAR
                    GAS_FOR_TRANSFER,
                )
                .then(
                    Promise::new(htlc.receiver.clone())
                        .transfer(SAFETY_DEPOSIT)
                )
                .then(
                    Promise::new(env::current_account_id()).function_call(
                        "withdraw_callback".to_string(),
                        serde_json::json!({
                            "hashlock": hashlock,
                            "success": true
                        })
                        .to_string()
                        .into_bytes(),
                        NO_DEPOSIT,
                        GAS_FOR_WITHDRAW_CALLBACK,
                    )
                )
            }
        }
    }

    pub fn cancel(&mut self, hashlock: String) -> Promise {
        let mut htlc = self.htlcs.get(&hashlock).expect("HTLC not found");
        
        assert_eq!(htlc.status, HTLCStatus::Active, "HTLC not active");
        assert_eq!(
            htlc.sender,
            env::predecessor_account_id(),
            "Only sender can cancel"
        );
        assert!(
            env::block_timestamp() >= htlc.timeout,
            "Timeout not reached"
        );
        
        // Update status to processing
        htlc.status = HTLCStatus::Processing;
        self.htlcs.insert(&hashlock, &htlc);
        
        // Prepare refund based on token type
        match &htlc.token {
            None => {
                // NEAR refund
                self.near_balance -= htlc.amount.0 + SAFETY_DEPOSIT;
                Promise::new(htlc.sender.clone())
                    .transfer(htlc.amount.0 + SAFETY_DEPOSIT)
                    .then(
                        Promise::new(env::current_account_id()).function_call(
                            "cancel_callback".to_string(),
                            serde_json::json!({
                                "hashlock": hashlock,
                                "success": true
                            })
                            .to_string()
                            .into_bytes(),
                            NO_DEPOSIT,
                            GAS_FOR_CANCEL_CALLBACK,
                        )
                    )
            }
            Some(token_id) => {
                // Fungible token refund
                self.near_balance -= SAFETY_DEPOSIT;
                let current_balance = self.token_balances.get(token_id).unwrap_or(0);
                self.token_balances.insert(token_id, &(current_balance - htlc.amount.0));
                
                Promise::new(token_id.clone()).function_call(
                    "ft_transfer".to_string(),
                    serde_json::json!({
                        "receiver_id": htlc.sender.clone(),
                        "amount": htlc.amount
                    })
                    .to_string()
                    .into_bytes(),
                    1, // 1 yoctoNEAR
                    GAS_FOR_TRANSFER,
                )
                .then(
                    Promise::new(htlc.sender.clone())
                        .transfer(SAFETY_DEPOSIT)
                )
                .then(
                    Promise::new(env::current_account_id()).function_call(
                        "cancel_callback".to_string(),
                        serde_json::json!({
                            "hashlock": hashlock,
                            "success": true
                        })
                        .to_string()
                        .into_bytes(),
                        NO_DEPOSIT,
                        GAS_FOR_CANCEL_CALLBACK,
                    )
                )
            }
        }
    }

    // Callbacks
    #[private]
    pub fn withdraw_callback(&mut self, hashlock: String, #[allow(unused)] success: bool) {
        let mut htlc = self.htlcs.get(&hashlock).expect("HTLC not found");
        htlc.status = HTLCStatus::Withdrawn;
        self.htlcs.insert(&hashlock, &htlc);
        
        let event = HTLCWithdrawnEvent {
            hashlock,
            secret: htlc.secret.unwrap_or_default(),
            receiver: htlc.receiver,
        };
        env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap()));
    }

    #[private]
    pub fn cancel_callback(&mut self, hashlock: String, #[allow(unused)] success: bool) {
        let mut htlc = self.htlcs.get(&hashlock).expect("HTLC not found");
        htlc.status = HTLCStatus::Cancelled;
        self.htlcs.insert(&hashlock, &htlc);
        
        let event = HTLCCancelledEvent {
            hashlock,
            sender: htlc.sender,
        };
        env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap()));
    }

    // FT callback
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> U128 {
        let htlc = self.htlcs.get(&msg).expect("Invalid HTLC hashlock in msg");
        assert_eq!(sender_id, htlc.sender, "Unauthorized sender");
        assert_eq!(amount, htlc.amount, "Incorrect amount");
        assert_eq!(htlc.status, HTLCStatus::Active, "HTLC not active");
        
        // Update token balance
        let token = htlc.token.as_ref().expect("Token expected");
        let current_balance = self.token_balances.get(token).unwrap_or(0);
        self.token_balances.insert(token, &(current_balance + amount.0));
        
        // Return 0 to keep all tokens
        U128(0)
    }

    // View methods
    pub fn get_htlc(&self, hashlock: String) -> Option<HTLC> {
        self.htlcs.get(&hashlock)
    }

    pub fn hash_secret(&self, secret: &str) -> String {
        use near_sdk::env::keccak256;
        let hash = keccak256(secret.as_bytes());
        format!("0x{}", hex::encode(hash))
    }
}