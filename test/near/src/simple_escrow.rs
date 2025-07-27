use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::{env, near_bindgen, AccountId, PanicOnDefault, Promise, NearToken};

#[near_bindgen]
#[derive(BorshSerialize, BorshDeserialize, PanicOnDefault)]
pub struct SimpleEscrow {
    pub owner: AccountId,
    pub escrows: UnorderedMap<String, Escrow>,
    pub escrow_count: u64,
}

#[derive(BorshSerialize, BorshDeserialize)]
pub struct Escrow {
    pub depositor: AccountId,
    pub recipient: AccountId,
    pub amount: u128,
    pub secret_hash: String,
    pub timeout: u64,
    pub is_completed: bool,
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
    ) -> String {
        let deposit = env::attached_deposit();
        assert!(deposit.as_yoctonear() > 0, "Deposit required");
        
        self.escrow_count += 1;
        let escrow_id = format!("escrow_{}", self.escrow_count);
        
        let escrow = Escrow {
            depositor: env::predecessor_account_id(),
            recipient,
            amount: deposit.as_yoctonear(),
            secret_hash,
            timeout: env::block_timestamp() + (timeout_seconds * 1_000_000_000),
            is_completed: false,
        };
        
        self.escrows.insert(&escrow_id, &escrow);
        
        env::log_str(&format!(
            "Escrow created: {} - {} NEAR from {} to {}",
            escrow_id,
            deposit.as_yoctonear() / 10u128.pow(24),
            escrow.depositor,
            escrow.recipient
        ));
        
        escrow_id
    }

    pub fn complete_escrow(&mut self, escrow_id: String, secret: String) -> Promise {
        let mut escrow = self.escrows.get(&escrow_id).expect("Escrow not found");
        assert!(!escrow.is_completed, "Already completed");
        assert!(env::block_timestamp() <= escrow.timeout, "Escrow expired");
        
        // Verify secret
        let secret_hash = hex::encode(env::sha256(secret.as_bytes()));
        assert_eq!(secret_hash, escrow.secret_hash, "Invalid secret");
        
        escrow.is_completed = true;
        self.escrows.insert(&escrow_id, &escrow);
        
        env::log_str(&format!(
            "Escrow completed: {} - transferring {} yoctoNEAR to {}",
            escrow_id,
            escrow.amount,
            escrow.recipient
        ));
        
        // Transfer to recipient
        Promise::new(escrow.recipient).transfer(NearToken::from_yoctonear(escrow.amount))
    }

    pub fn refund_escrow(&mut self, escrow_id: String) -> Promise {
        let mut escrow = self.escrows.get(&escrow_id).expect("Escrow not found");
        assert!(!escrow.is_completed, "Already completed");
        assert!(env::block_timestamp() > escrow.timeout, "Not expired yet");
        
        escrow.is_completed = true;
        self.escrows.insert(&escrow_id, &escrow);
        
        env::log_str(&format!(
            "Escrow refunded: {} - returning {} yoctoNEAR to {}",
            escrow_id,
            escrow.amount,
            escrow.depositor
        ));
        
        // Refund to depositor
        Promise::new(escrow.depositor).transfer(NearToken::from_yoctonear(escrow.amount))
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
}