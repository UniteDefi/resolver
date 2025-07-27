use near_sdk::borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::LookupMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{env, near, AccountId, Balance, Gas, PanicOnDefault, Promise, Timestamp, NearToken};

pub const TGAS: u64 = 1_000_000_000_000;
pub const NO_DEPOSIT: Balance = 0;
pub const XCC_SUCCESS: u64 = 1;

pub const GAS_FOR_TRANSFER: Gas = Gas::from_tgas(5);
pub const GAS_FOR_SETTLE_CALLBACK: Gas = Gas::from_tgas(20);
pub const STORAGE_COST_PER_AUCTION: Balance = 1_000_000_000_000_000_000_000; // 0.001 NEAR

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct Auction {
    pub auction_id: String,
    pub seller: AccountId,
    pub token: AccountId,
    pub amount: U128,
    pub start_price: U128,
    pub end_price: U128,
    pub start_time: Timestamp,
    pub end_time: Timestamp,
    pub is_settled: bool,
    pub resolver: Option<AccountId>,
    pub settlement_price: Option<U128>,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct AuctionCreatedEvent {
    pub auction_id: String,
    pub seller: AccountId,
    pub token: AccountId,
    pub amount: U128,
    pub start_price: U128,
    pub end_price: U128,
    pub end_time: Timestamp,
}

#[derive(BorshSerialize, BorshDeserialize, Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct AuctionSettledEvent {
    pub auction_id: String,
    pub resolver: AccountId,
    pub price: U128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct DutchAuction {
    auctions: LookupMap<String, Auction>,
    token_balances: LookupMap<AccountId, Balance>,
}

#[near]
impl DutchAuction {
    #[init]
    pub fn new() -> Self {
        Self {
            auctions: LookupMap::new(b"a"),
            token_balances: LookupMap::new(b"b"),
        }
    }

    #[payable]
    pub fn create_auction(
        &mut self,
        auction_id: String,
        token: AccountId,
        amount: U128,
        start_price: U128,
        end_price: U128,
        duration: u64, // in nanoseconds
    ) -> Promise {
        assert!(
            env::attached_deposit() >= STORAGE_COST_PER_AUCTION,
            "Insufficient storage deposit"
        );

        assert!(
            self.auctions.get(&auction_id).is_none(),
            "Auction already exists"
        );
        assert!(start_price.0 > end_price.0, "Invalid price range");
        assert!(duration > 0, "Duration must be positive");

        let start_time = env::block_timestamp();
        let end_time = start_time + duration;

        let auction = Auction {
            auction_id: auction_id.clone(),
            seller: env::predecessor_account_id(),
            token: token.clone(),
            amount,
            start_price,
            end_price,
            start_time,
            end_time,
            is_settled: false,
            resolver: None,
            settlement_price: None,
        };

        self.auctions.insert(&auction_id, &auction);

        // Emit event
        let event = AuctionCreatedEvent {
            auction_id: auction_id.clone(),
            seller: env::predecessor_account_id(),
            token: token.clone(),
            amount,
            start_price,
            end_price,
            end_time,
        };
        env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap()));

        // Transfer tokens from seller to contract
        Promise::new(token).function_call(
            "ft_transfer_call".to_string(),
            serde_json::json!({
                "receiver_id": env::current_account_id(),
                "amount": amount,
                "msg": auction_id
            })
            .to_string()
            .into_bytes(),
            NO_DEPOSIT,
            GAS_FOR_TRANSFER,
        )
    }

    pub fn get_current_price(&self, auction_id: String) -> U128 {
        let auction = self
            .auctions
            .get(&auction_id)
            .expect("Auction not found");

        if auction.is_settled {
            return auction.settlement_price.unwrap_or(U128(0));
        }

        let current_time = env::block_timestamp();
        if current_time >= auction.end_time {
            return auction.end_price;
        }

        let elapsed = current_time - auction.start_time;
        let duration = auction.end_time - auction.start_time;
        let price_range = auction.start_price.0 - auction.end_price.0;
        let price_drop = (price_range * elapsed) / duration;

        U128(auction.start_price.0 - price_drop)
    }

    #[payable]
    pub fn settle_auction(&mut self, auction_id: String) -> Promise {
        let mut auction = self
            .auctions
            .get(&auction_id)
            .expect("Auction not found");

        assert!(!auction.is_settled, "Auction already settled");
        assert!(
            env::block_timestamp() < auction.end_time,
            "Auction expired"
        );

        let current_price = self.get_current_price(auction_id.clone());
        assert!(
            env::attached_deposit() >= current_price.0,
            "Insufficient payment"
        );

        auction.is_settled = true;
        auction.resolver = Some(env::predecessor_account_id());
        auction.settlement_price = Some(current_price);

        self.auctions.insert(&auction_id, &auction);

        // Transfer payment to seller
        let refund = env::attached_deposit() - current_price.0;
        let mut transfer_promise = Promise::new(auction.seller.clone()).transfer(current_price.0);

        if refund > 0 {
            transfer_promise = transfer_promise
                .then(Promise::new(env::predecessor_account_id()).transfer(refund));
        }

        // Emit event
        let event = AuctionSettledEvent {
            auction_id: auction_id.clone(),
            resolver: env::predecessor_account_id(),
            price: current_price,
        };
        env::log_str(&format!("EVENT_JSON:{}", serde_json::to_string(&event).unwrap()));

        // Transfer tokens to resolver
        transfer_promise.then(
            Promise::new(auction.token).function_call(
                "ft_transfer".to_string(),
                serde_json::json!({
                    "receiver_id": env::predecessor_account_id(),
                    "amount": auction.amount
                })
                .to_string()
                .into_bytes(),
                1, // 1 yoctoNEAR for security
                GAS_FOR_TRANSFER,
            ),
        )
    }

    // Callback for FT transfers
    pub fn ft_on_transfer(
        &mut self,
        sender_id: AccountId,
        amount: U128,
        msg: String,
    ) -> Promise {
        let auction = self.auctions.get(&msg).expect("Invalid auction ID in msg");
        assert_eq!(sender_id, auction.seller, "Unauthorized sender");
        assert_eq!(amount, auction.amount, "Incorrect amount");

        // Update token balance tracking
        let current_balance = self.token_balances.get(&auction.token).unwrap_or(0);
        self.token_balances
            .insert(&auction.token, &(current_balance + amount.0));

        // Return 0 to indicate we're keeping all tokens
        Promise::new(env::current_account_id()).function_call(
            "noop".to_string(),
            b"".to_vec(),
            NO_DEPOSIT,
            Gas::from_tgas(1),
        )
    }

    // View methods
    pub fn get_auction(&self, auction_id: String) -> Option<Auction> {
        self.auctions.get(&auction_id)
    }

    pub fn is_active(&self, auction_id: String) -> bool {
        if let Some(auction) = self.auctions.get(&auction_id) {
            !auction.is_settled && env::block_timestamp() < auction.end_time
        } else {
            false
        }
    }
}