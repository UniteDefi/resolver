use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near_bindgen, AccountId, Balance, Gas, PanicOnDefault, Promise, Timestamp};

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct SwapOrder {
    pub user: AccountId,
    pub source_token: Option<AccountId>,
    pub dest_token: Option<AccountId>,
    pub source_amount: U128,
    pub dest_amount: U128,
    pub secret_hash: String,
    pub deadline: Timestamp,
    pub dest_chain: String,
    pub dest_recipient: String,
    pub is_completed: bool,
    pub is_cancelled: bool,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct ResolverCommitment {
    pub resolver: AccountId,
    pub source_escrow: String,
    pub dest_escrow: String,
    pub commit_time: Timestamp,
    pub is_active: bool,
    pub is_completed: bool,
}

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct RelayerContract {
    pub orders: LookupMap<String, SwapOrder>,
    pub commitments: LookupMap<String, ResolverCommitment>,
    pub authorized_resolvers: LookupMap<AccountId, bool>,
    pub relayer_operator: AccountId,
}

const EXECUTION_TIMEOUT: u64 = 300_000_000_000; // 5 minutes in nanoseconds

#[near_bindgen]
impl RelayerContract {
    #[init]
    pub fn new() -> Self {
        Self {
            orders: LookupMap::new(b"o"),
            commitments: LookupMap::new(b"c"),
            authorized_resolvers: LookupMap::new(b"r"),
            relayer_operator: env::predecessor_account_id(),
        }
    }

    pub fn authorize_resolver(&mut self, resolver: AccountId) {
        assert_eq!(env::predecessor_account_id(), self.relayer_operator, "Only relayer can authorize");
        self.authorized_resolvers.insert(&resolver, &true);
    }

    pub fn create_order(
        &mut self,
        source_token: Option<AccountId>,
        dest_token: Option<AccountId>,
        source_amount: U128,
        dest_amount: U128,
        secret_hash: String,
        deadline: Timestamp,
        dest_chain: String,
        dest_recipient: String,
    ) -> String {
        let order_id = format!(
            "{}:{}:{}:{}",
            env::predecessor_account_id(),
            env::block_timestamp(),
            source_amount.0,
            secret_hash
        );

        let order = SwapOrder {
            user: env::predecessor_account_id(),
            source_token,
            dest_token,
            source_amount,
            dest_amount,
            secret_hash,
            deadline,
            dest_chain,
            dest_recipient,
            is_completed: false,
            is_cancelled: false,
        };

        self.orders.insert(&order_id, &order);

        env::log_str(&format!(
            "ORDER_CREATED:{{\"order_id\":\"{}\",\"user\":\"{}\",\"source_amount\":\"{}\",\"dest_amount\":\"{}\",\"dest_chain\":\"{}\"}}",
            order_id,
            order.user,
            source_amount.0,
            dest_amount.0,
            dest_chain
        ));

        order_id
    }

    pub fn commit_to_order(
        &mut self,
        order_id: String,
        source_escrow: String,
        dest_escrow: String,
    ) {
        let resolver = env::predecessor_account_id();
        assert!(
            self.authorized_resolvers.get(&resolver).unwrap_or(false),
            "Not authorized resolver"
        );

        let mut order = self.orders.get(&order_id).expect("Order does not exist");
        assert!(!order.is_completed, "Order already completed");
        assert!(env::block_timestamp() <= order.deadline, "Order expired");
        assert!(!self.commitments.contains_key(&order_id), "Order already committed");

        let commitment = ResolverCommitment {
            resolver,
            source_escrow,
            dest_escrow,
            commit_time: env::block_timestamp(),
            is_active: true,
            is_completed: false,
        };

        self.commitments.insert(&order_id, &commitment);

        env::log_str(&format!(
            "RESOLVER_COMMITTED:{{\"order_id\":\"{}\",\"resolver\":\"{}\",\"commit_time\":{}}}",
            order_id,
            commitment.resolver,
            commitment.commit_time
        ));
    }

    pub fn transfer_user_funds(&mut self, order_id: String) {
        assert_eq!(env::predecessor_account_id(), self.relayer_operator, "Only relayer can transfer");

        let order = self.orders.get(&order_id).expect("Order does not exist");
        let commitment = self.commitments.get(&order_id).expect("No active commitment");
        
        assert!(commitment.is_active, "No active commitment");
        assert!(!order.is_completed, "Order already completed");

        // For NEAR tokens, transfer from user to escrow
        if let Some(token_id) = &order.source_token {
            // NEP-141 token transfer
            Promise::new(token_id.clone()).function_call(
                "ft_transfer_from".to_string(),
                format!(
                    r#"{{"owner_id":"{}","new_owner_id":"{}","amount":"{}"}}"#,
                    order.user,
                    commitment.source_escrow,
                    order.source_amount.0
                ).into_bytes(),
                1, // 1 yoctoNEAR for security
                Gas::from_tgas(50),
            );
        } else {
            // Native NEAR transfer - this should be handled by escrow contract
            env::log_str(&format!(
                "NATIVE_TRANSFER_INITIATED:{{\"order_id\":\"{}\",\"amount\":\"{}\"}}",
                order_id,
                order.source_amount.0
            ));
        }
    }

    pub fn complete_order(&mut self, order_id: String, secret: String) {
        assert_eq!(env::predecessor_account_id(), self.relayer_operator, "Only relayer can complete");

        let mut order = self.orders.get(&order_id).expect("Order does not exist");
        let mut commitment = self.commitments.get(&order_id).expect("No active commitment");

        assert!(commitment.is_active, "No active commitment");
        assert!(!order.is_completed, "Order already completed");

        // Verify secret hash
        let secret_hash = hex::encode(env::sha256(secret.as_bytes()));
        assert_eq!(secret_hash, order.secret_hash, "Invalid secret");

        order.is_completed = true;
        commitment.is_completed = true;

        self.orders.insert(&order_id, &order);
        self.commitments.insert(&order_id, &commitment);

        env::log_str(&format!(
            "ORDER_COMPLETED:{{\"order_id\":\"{}\",\"resolver\":\"{}\",\"secret\":\"{}\"}}",
            order_id,
            commitment.resolver,
            secret
        ));
    }

    pub fn rescue_order(
        &mut self,
        order_id: String,
        new_source_escrow: String,
        new_dest_escrow: String,
    ) {
        let rescuer = env::predecessor_account_id();
        assert!(
            self.authorized_resolvers.get(&rescuer).unwrap_or(false),
            "Not authorized resolver"
        );

        let order = self.orders.get(&order_id).expect("Order does not exist");
        let mut commitment = self.commitments.get(&order_id).expect("No active commitment");

        assert!(commitment.is_active, "No active commitment");
        assert!(!order.is_completed, "Order already completed");
        assert!(
            env::block_timestamp() > commitment.commit_time + EXECUTION_TIMEOUT,
            "Execution timeout not reached"
        );
        assert_ne!(rescuer, commitment.resolver, "Cannot rescue own order");

        let original_resolver = commitment.resolver.clone();

        // Update commitment to new resolver
        commitment.resolver = rescuer;
        commitment.source_escrow = new_source_escrow;
        commitment.dest_escrow = new_dest_escrow;
        commitment.commit_time = env::block_timestamp();

        self.commitments.insert(&order_id, &commitment);

        env::log_str(&format!(
            "ORDER_RESCUED:{{\"order_id\":\"{}\",\"rescuer\":\"{}\",\"original_resolver\":\"{}\"}}",
            order_id,
            commitment.resolver,
            original_resolver
        ));
    }

    // View methods
    pub fn get_order(&self, order_id: String) -> Option<SwapOrder> {
        self.orders.get(&order_id)
    }

    pub fn get_commitment(&self, order_id: String) -> Option<ResolverCommitment> {
        self.commitments.get(&order_id)
    }

    pub fn is_order_executable(&self, order_id: String) -> bool {
        if let (Some(order), Some(commitment)) = (self.orders.get(&order_id), self.commitments.get(&order_id)) {
            !order.is_completed && commitment.is_active && env::block_timestamp() <= order.deadline
        } else {
            false
        }
    }

    pub fn is_order_rescuable(&self, order_id: String) -> bool {
        if let (Some(order), Some(commitment)) = (self.orders.get(&order_id), self.commitments.get(&order_id)) {
            !order.is_completed && 
            commitment.is_active && 
            env::block_timestamp() > commitment.commit_time + EXECUTION_TIMEOUT
        } else {
            false
        }
    }

    pub fn is_authorized_resolver(&self, resolver: AccountId) -> bool {
        self.authorized_resolvers.get(&resolver).unwrap_or(false)
    }
}