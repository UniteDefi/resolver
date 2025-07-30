use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::store::UnorderedMap;
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, Promise, NearToken};
use near_sdk::serde::{Serialize, Deserialize};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct SimpleEscrow {
    pub owner: AccountId,
    pub escrows: UnorderedMap<String, Escrow>,
    pub escrow_count: u64,
}

#[derive(BorshSerialize, BorshDeserialize, Clone)]
pub struct Escrow {
    pub depositor: AccountId,
    pub recipient: AccountId,
    pub amount: u128,
    pub safety_deposit: u128, // Safety deposit for resolver
    pub secret_hash: String,
    pub timeout: u64, // Timeout in seconds (EVM-compatible)
    pub is_completed: bool,
}

// Event structures matching EVM format
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct EscrowCreatedEvent {
    pub escrow_id: String,
    pub depositor: AccountId,
    pub recipient: AccountId,
    pub amount: String,
    pub secret_hash: String,
    pub timeout: u64,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct EscrowWithdrawalEvent {
    pub escrow_id: String,
    pub secret: String,
}

#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct EscrowCancelledEvent {
    pub escrow_id: String,
}

#[near_bindgen]
impl SimpleEscrow {
    #[init]
    pub fn new() -> Self {
        Self {
            owner: env::predecessor_account_id(),
            escrows: UnorderedMap::new(b"e"),
            escrow_count: 0,
        }
    }

    #[payable]
    pub fn create_escrow(
        &mut self,
        recipient: AccountId,
        secret_hash: String,
        timeout_seconds: u64,
        safety_deposit: u128,
    ) -> String {
        let deposit = env::attached_deposit();
        let total_required = deposit.as_yoctonear().saturating_sub(safety_deposit);
        assert!(total_required > 0, "Amount must be greater than zero");
        assert!(deposit.as_yoctonear() >= total_required + safety_deposit, "Insufficient deposit");
        
        self.escrow_count += 1;
        let escrow_id = format!("escrow_{}", self.escrow_count);
        
        let escrow = Escrow {
            depositor: env::predecessor_account_id(),
            recipient,
            amount: total_required,
            safety_deposit,
            secret_hash,
            timeout: env::block_timestamp() / 1_000_000_000 + timeout_seconds,
            is_completed: false,
        };
        
        // Emit event matching EVM format
        let event = EscrowCreatedEvent {
            escrow_id: escrow_id.clone(),
            depositor: escrow.depositor.clone(),
            recipient: escrow.recipient.clone(),
            amount: deposit.as_yoctonear().to_string(),
            secret_hash: escrow.secret_hash.clone(),
            timeout: escrow.timeout,
        };
        env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap()));
        
        self.escrows.insert(escrow_id.clone(), escrow);
        
        escrow_id
    }

    pub fn complete_escrow(&mut self, escrow_id: String, secret: String) -> Promise {
        let mut escrow = self.escrows.get(&escrow_id).expect("Escrow not found").clone();
        assert!(!escrow.is_completed, "Already completed");
        assert!(env::block_timestamp() / 1_000_000_000 <= escrow.timeout, "Escrow expired");
        
        // Verify secret using keccak256 to match EVM
        let secret_hash = hex::encode(env::keccak256(secret.as_bytes()));
        assert_eq!(secret_hash, escrow.secret_hash, "Invalid secret");
        
        escrow.is_completed = true;
        
        let recipient = escrow.recipient.clone();
        let amount = escrow.amount;
        let safety_deposit = escrow.safety_deposit;
        
        self.escrows.insert(escrow_id.clone(), escrow);
        
        // Emit event matching EVM format
        let event = EscrowWithdrawalEvent {
            escrow_id: escrow_id.clone(),
            secret: secret.clone(),
        };
        env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap()));
        
        // Transfer amount + safety deposit to recipient
        Promise::new(recipient).transfer(NearToken::from_yoctonear(amount + safety_deposit))
    }

    pub fn refund_escrow(&mut self, escrow_id: String) -> Promise {
        let mut escrow = self.escrows.get(&escrow_id).expect("Escrow not found").clone();
        assert!(!escrow.is_completed, "Already completed");
        assert!(env::block_timestamp() / 1_000_000_000 > escrow.timeout, "Not expired yet");
        
        escrow.is_completed = true;
        
        let depositor = escrow.depositor.clone();
        let amount = escrow.amount;
        let safety_deposit = escrow.safety_deposit;
        
        self.escrows.insert(escrow_id.clone(), escrow);
        
        // Emit event matching EVM format
        let event = EscrowCancelledEvent {
            escrow_id: escrow_id.clone(),
        };
        env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap()));
        
        // Refund amount + safety deposit to depositor
        Promise::new(depositor).transfer(NearToken::from_yoctonear(amount + safety_deposit))
    }

    pub fn get_escrow(&self, escrow_id: String) -> Option<String> {
        self.escrows.get(&escrow_id).map(|e| {
            format!(
                "depositor:{},recipient:{},amount:{},timeout:{},completed:{}",
                e.depositor,
                e.recipient,
                e.amount,
                e.timeout,
                e.is_completed
            )
        })
    }

    // EVM-compatible function names
    pub fn claimWithSecret(&mut self, escrow_id: String, secret: String) -> Promise {
        self.complete_escrow(escrow_id, secret)
    }

    pub fn refund(&mut self, escrow_id: String) -> Promise {
        self.refund_escrow(escrow_id)
    }

    // Backward compatibility wrapper - creates escrow without safety deposit
    #[payable]
    pub fn create_escrow_simple(
        &mut self,
        recipient: AccountId,
        secret_hash: String,
        timeout_seconds: u64,
    ) -> String {
        self.create_escrow(recipient, secret_hash, timeout_seconds, 0)
    }

    // Helper function to compute secret hash (for testing/debugging)
    pub fn compute_secret_hash(&self, secret: String) -> String {
        hex::encode(env::keccak256(secret.as_bytes()))
    }

    // Get escrow details in a structured format
    pub fn get_escrow_details(&self, escrow_id: String) -> Option<Escrow> {
        self.escrows.get(&escrow_id).cloned()
    }
}