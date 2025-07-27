use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, Balance, Gas, PanicOnDefault, Promise, Timestamp};

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Escrow {
    pub resolver: AccountId,
    pub user: AccountId,
    pub token: Option<AccountId>,
    pub amount: U128,
    pub safety_deposit: U128,
    pub secret_hash: String,
    pub timeout: Timestamp,
    pub is_source_escrow: bool,
    pub is_completed: bool,
    pub is_refunded: bool,
    pub revealed_secret: Option<String>,
}

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct NearEscrow {
    pub escrows: LookupMap<String, Escrow>,
    pub resolver_deposits: LookupMap<AccountId, U128>,
    pub relayer_contract: AccountId,
}

#[near_bindgen]
impl NearEscrow {
    #[init]
    pub fn new(relayer_contract: AccountId) -> Self {
        Self {
            escrows: LookupMap::new(b"e"),
            resolver_deposits: LookupMap::new(b"d"),
            relayer_contract,
        }
    }

    #[payable]
    pub fn create_escrow(
        &mut self,
        escrow_id: String,
        user: AccountId,
        token: Option<AccountId>,
        amount: U128,
        secret_hash: String,
        timeout: Timestamp,
        is_source_escrow: bool,
    ) {
        assert!(!self.escrows.contains_key(&escrow_id), "Escrow already exists");
        
        let safety_deposit = env::attached_deposit();
        assert!(safety_deposit > 0, "Safety deposit required");

        let resolver = env::predecessor_account_id();
        
        let escrow = Escrow {
            resolver: resolver.clone(),
            user,
            token: token.clone(),
            amount,
            safety_deposit: U128(safety_deposit),
            secret_hash,
            timeout,
            is_source_escrow,
            is_completed: false,
            is_refunded: false,
            revealed_secret: None,
        };

        // Update resolver deposits tracker
        let current_deposits = self.resolver_deposits.get(&resolver).unwrap_or(U128(0));
        self.resolver_deposits.insert(&resolver, &U128(current_deposits.0 + safety_deposit));

        // For destination escrows, resolver must deposit tokens immediately
        if !is_source_escrow {
            if let Some(token_id) = &token {
                // NEP-141 token deposit
                Promise::new(token_id.clone()).function_call(
                    "ft_transfer_from".to_string(),
                    format!(
                        r#"{{"owner_id":"{}","new_owner_id":"{}","amount":"{}"}}"#,
                        resolver,
                        env::current_account_id(),
                        amount.0
                    ).into_bytes(),
                    1, // 1 yoctoNEAR for security
                    Gas::from_tgas(50),
                );
            }
            // For native NEAR, the amount should be attached along with safety deposit
        }

        self.escrows.insert(&escrow_id, &escrow);

        env::log_str(&format!(
            "ESCROW_CREATED:{{\"escrow_id\":\"{}\",\"resolver\":\"{}\",\"user\":\"{}\",\"amount\":\"{}\",\"safety_deposit\":\"{}\",\"is_source\":{}}}",
            escrow_id,
            resolver,
            escrow.user,
            amount.0,
            safety_deposit,
            is_source_escrow
        ));
    }

    pub fn complete_escrow(&mut self, escrow_id: String, secret: String) {
        let mut escrow = self.escrows.get(&escrow_id).expect("Escrow does not exist");
        assert!(!escrow.is_completed, "Already completed");
        assert!(!escrow.is_refunded, "Already refunded");
        assert!(env::block_timestamp() <= escrow.timeout, "Escrow expired");

        // Verify secret hash
        let secret_hash = hex::encode(env::sha256(secret.as_bytes()));
        assert_eq!(secret_hash, escrow.secret_hash, "Invalid secret");

        escrow.is_completed = true;
        escrow.revealed_secret = Some(secret.clone());

        if escrow.is_source_escrow {
            // Source chain: Resolver withdraws user funds + safety deposit
            if let Some(token_id) = &escrow.token {
                // Transfer tokens to resolver
                Promise::new(token_id.clone()).function_call(
                    "ft_transfer".to_string(),
                    format!(
                        r#"{{"receiver_id":"{}","amount":"{}"}}"#,
                        escrow.resolver,
                        escrow.amount.0
                    ).into_bytes(),
                    1,
                    Gas::from_tgas(50),
                );
            } else {
                // Native NEAR transfer to resolver
                Promise::new(escrow.resolver.clone()).transfer(escrow.amount.0);
            }
            
            // Return safety deposit to resolver
            Promise::new(escrow.resolver.clone()).transfer(escrow.safety_deposit.0);
        } else {
            // Destination chain: User receives tokens, resolver gets safety deposit back
            if let Some(token_id) = &escrow.token {
                // Transfer tokens to user
                Promise::new(token_id.clone()).function_call(
                    "ft_transfer".to_string(),
                    format!(
                        r#"{{"receiver_id":"{}","amount":"{}"}}"#,
                        escrow.user,
                        escrow.amount.0
                    ).into_bytes(),
                    1,
                    Gas::from_tgas(50),
                );
            } else {
                // Native NEAR transfer to user
                Promise::new(escrow.user.clone()).transfer(escrow.amount.0);
            }
            
            // Return safety deposit to resolver
            Promise::new(escrow.resolver.clone()).transfer(escrow.safety_deposit.0);
        }

        // Update resolver deposits
        let current_deposits = self.resolver_deposits.get(&escrow.resolver).unwrap_or(U128(0));
        self.resolver_deposits.insert(&escrow.resolver, &U128(current_deposits.0 - escrow.safety_deposit.0));

        self.escrows.insert(&escrow_id, &escrow);

        env::log_str(&format!(
            "ESCROW_COMPLETED:{{\"escrow_id\":\"{}\",\"secret\":\"{}\"}}",
            escrow_id,
            secret
        ));
    }

    pub fn refund_escrow(&mut self, escrow_id: String) {
        let mut escrow = self.escrows.get(&escrow_id).expect("Escrow does not exist");
        assert!(!escrow.is_completed, "Already completed");
        assert!(!escrow.is_refunded, "Already refunded");
        assert!(env::block_timestamp() > escrow.timeout, "Not expired yet");

        escrow.is_refunded = true;

        if escrow.is_source_escrow {
            // Source chain: Return tokens to user, safety deposit to resolver
            if let Some(token_id) = &escrow.token {
                Promise::new(token_id.clone()).function_call(
                    "ft_transfer".to_string(),
                    format!(
                        r#"{{"receiver_id":"{}","amount":"{}"}}"#,
                        escrow.user,
                        escrow.amount.0
                    ).into_bytes(),
                    1,
                    Gas::from_tgas(50),
                );
            } else {
                Promise::new(escrow.user.clone()).transfer(escrow.amount.0);
            }
            Promise::new(escrow.resolver.clone()).transfer(escrow.safety_deposit.0);
        } else {
            // Destination chain: Return tokens to resolver, safety deposit to user (penalty)
            if let Some(token_id) = &escrow.token {
                Promise::new(token_id.clone()).function_call(
                    "ft_transfer".to_string(),
                    format!(
                        r#"{{"receiver_id":"{}","amount":"{}"}}"#,
                        escrow.resolver,
                        escrow.amount.0
                    ).into_bytes(),
                    1,
                    Gas::from_tgas(50),
                );
            } else {
                Promise::new(escrow.resolver.clone()).transfer(escrow.amount.0);
            }
            Promise::new(escrow.user.clone()).transfer(escrow.safety_deposit.0);
        }

        // Update resolver deposits
        let current_deposits = self.resolver_deposits.get(&escrow.resolver).unwrap_or(U128(0));
        self.resolver_deposits.insert(&escrow.resolver, &U128(current_deposits.0 - escrow.safety_deposit.0));

        self.escrows.insert(&escrow_id, &escrow);

        env::log_str(&format!(
            "ESCROW_REFUNDED:{{\"escrow_id\":\"{}\"}}",
            escrow_id
        ));
    }

    pub fn claim_safety_deposit(&mut self, escrow_id: String) {
        let mut escrow = self.escrows.get(&escrow_id).expect("Escrow does not exist");
        let claimer = env::predecessor_account_id();
        
        assert!(!escrow.is_completed, "Already completed");
        assert!(!escrow.is_refunded, "Already refunded");
        assert!(env::block_timestamp() > escrow.timeout, "Not expired yet");
        assert_ne!(claimer, escrow.resolver, "Resolver cannot claim own deposit");

        escrow.is_refunded = true;

        if !escrow.is_source_escrow {
            if let Some(token_id) = &escrow.token {
                // Return tokens to resolver first
                Promise::new(token_id.clone()).function_call(
                    "ft_transfer".to_string(),
                    format!(
                        r#"{{"receiver_id":"{}","amount":"{}"}}"#,
                        escrow.resolver,
                        escrow.amount.0
                    ).into_bytes(),
                    1,
                    Gas::from_tgas(50),
                );
            }
        }

        // Safety deposit goes to claimer as reward
        Promise::new(claimer.clone()).transfer(escrow.safety_deposit.0);

        // Update resolver deposits
        let current_deposits = self.resolver_deposits.get(&escrow.resolver).unwrap_or(U128(0));
        self.resolver_deposits.insert(&escrow.resolver, &U128(current_deposits.0 - escrow.safety_deposit.0));

        self.escrows.insert(&escrow_id, &escrow);

        env::log_str(&format!(
            "SAFETY_DEPOSIT_CLAIMED:{{\"escrow_id\":\"{}\",\"claimer\":\"{}\"}}",
            escrow_id,
            claimer
        ));
    }

    // View methods
    pub fn get_escrow(&self, escrow_id: String) -> Option<Escrow> {
        self.escrows.get(&escrow_id)
    }

    pub fn is_escrow_expired(&self, escrow_id: String) -> bool {
        if let Some(escrow) = self.escrows.get(&escrow_id) {
            env::block_timestamp() > escrow.timeout
        } else {
            false
        }
    }

    pub fn get_resolver_deposits(&self, resolver: AccountId) -> U128 {
        self.resolver_deposits.get(&resolver).unwrap_or(U128(0))
    }
}