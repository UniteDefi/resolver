module unite_defi::dutch_auction {
    use std::signer;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::timestamp;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::account;
    use aptos_std::table::{Self, Table};

    const E_NOT_INITIALIZED: u64 = 1;
    const E_AUCTION_NOT_FOUND: u64 = 2;
    const E_AUCTION_NOT_ACTIVE: u64 = 3;
    const E_INSUFFICIENT_PAYMENT: u64 = 4;
    const E_NOT_SELLER: u64 = 5;
    const E_AUCTION_EXPIRED: u64 = 6;
    const E_INVALID_DURATION: u64 = 7;
    const E_INVALID_PRICE_RANGE: u64 = 8;

    struct AuctionStore has key {
        auctions: Table<u64, Auction>,
        next_auction_id: u64,
        auction_created_events: EventHandle<AuctionCreatedEvent>,
        auction_settled_events: EventHandle<AuctionSettledEvent>,
        auction_cancelled_events: EventHandle<AuctionCancelledEvent>,
    }

    struct Auction has store {
        seller: address,
        token_amount: u64,
        start_price: u64,
        end_price: u64,
        start_time: u64,
        duration: u64,
        active: bool,
        hash_secret: vector<u8>,
    }

    struct AuctionCreatedEvent has drop, store {
        auction_id: u64,
        seller: address,
        token_amount: u64,
        start_price: u64,
        end_price: u64,
        duration: u64,
        hash_secret: vector<u8>,
        timestamp: u64,
    }

    struct AuctionSettledEvent has drop, store {
        auction_id: u64,
        buyer: address,
        seller: address,
        token_amount: u64,
        payment_amount: u64,
        timestamp: u64,
    }

    struct AuctionCancelledEvent has drop, store {
        auction_id: u64,
        seller: address,
        timestamp: u64,
    }

    public fun initialize(account: &signer) {
        let auction_store = AuctionStore {
            auctions: table::new(),
            next_auction_id: 0,
            auction_created_events: account::new_event_handle<AuctionCreatedEvent>(account),
            auction_settled_events: account::new_event_handle<AuctionSettledEvent>(account),
            auction_cancelled_events: account::new_event_handle<AuctionCancelledEvent>(account),
        };
        move_to(account, auction_store);
    }

    public entry fun create_auction<CoinType>(
        seller: &signer,
        token_amount: u64,
        start_price: u64,
        end_price: u64,
        duration: u64,
        hash_secret: vector<u8>,
    ) acquires AuctionStore {
        let seller_addr = signer::address_of(seller);
        
        assert!(duration > 0, E_INVALID_DURATION);
        assert!(start_price > end_price, E_INVALID_PRICE_RANGE);
        assert!(exists<AuctionStore>(@unite_defi), E_NOT_INITIALIZED);

        let auction_store = borrow_global_mut<AuctionStore>(@unite_defi);
        let auction_id = auction_store.next_auction_id;
        
        let auction = Auction {
            seller: seller_addr,
            token_amount,
            start_price,
            end_price,
            start_time: timestamp::now_seconds(),
            duration,
            active: true,
            hash_secret,
        };

        table::add(&mut auction_store.auctions, auction_id, auction);
        auction_store.next_auction_id = auction_id + 1;

        event::emit_event(&mut auction_store.auction_created_events, AuctionCreatedEvent {
            auction_id,
            seller: seller_addr,
            token_amount,
            start_price,
            end_price,
            duration,
            hash_secret,
            timestamp: timestamp::now_seconds(),
        });
    }

    public fun get_current_price(auction_id: u64): u64 acquires AuctionStore {
        assert!(exists<AuctionStore>(@unite_defi), E_NOT_INITIALIZED);
        let auction_store = borrow_global<AuctionStore>(@unite_defi);
        assert!(table::contains(&auction_store.auctions, auction_id), E_AUCTION_NOT_FOUND);
        
        let auction = table::borrow(&auction_store.auctions, auction_id);
        assert!(auction.active, E_AUCTION_NOT_ACTIVE);
        
        let current_time = timestamp::now_seconds();
        let elapsed_time = current_time - auction.start_time;
        
        if (elapsed_time >= auction.duration) {
            return auction.end_price
        };
        
        let price_range = auction.start_price - auction.end_price;
        let price_drop = (price_range * elapsed_time) / auction.duration;
        auction.start_price - price_drop
    }

    public entry fun settle_auction<CoinType>(
        buyer: &signer,
        auction_id: u64,
        payment: Coin<CoinType>,
    ) acquires AuctionStore {
        let buyer_addr = signer::address_of(buyer);
        assert!(exists<AuctionStore>(@unite_defi), E_NOT_INITIALIZED);
        
        let auction_store = borrow_global_mut<AuctionStore>(@unite_defi);
        assert!(table::contains(&auction_store.auctions, auction_id), E_AUCTION_NOT_FOUND);
        
        let auction = table::borrow_mut(&mut auction_store.auctions, auction_id);
        assert!(auction.active, E_AUCTION_NOT_ACTIVE);
        
        let current_time = timestamp::now_seconds();
        assert!(current_time - auction.start_time <= auction.duration, E_AUCTION_EXPIRED);
        
        let current_price = get_current_price(auction_id);
        let payment_amount = coin::value(&payment);
        assert!(payment_amount >= current_price, E_INSUFFICIENT_PAYMENT);
        
        auction.active = false;
        
        coin::deposit(auction.seller, payment);
        
        event::emit_event(&mut auction_store.auction_settled_events, AuctionSettledEvent {
            auction_id,
            buyer: buyer_addr,
            seller: auction.seller,
            token_amount: auction.token_amount,
            payment_amount,
            timestamp: current_time,
        });
    }

    public entry fun cancel_auction(
        seller: &signer,
        auction_id: u64,
    ) acquires AuctionStore {
        let seller_addr = signer::address_of(seller);
        assert!(exists<AuctionStore>(@unite_defi), E_NOT_INITIALIZED);
        
        let auction_store = borrow_global_mut<AuctionStore>(@unite_defi);
        assert!(table::contains(&auction_store.auctions, auction_id), E_AUCTION_NOT_FOUND);
        
        let auction = table::borrow_mut(&mut auction_store.auctions, auction_id);
        assert!(auction.seller == seller_addr, E_NOT_SELLER);
        assert!(auction.active, E_AUCTION_NOT_ACTIVE);
        
        auction.active = false;
        
        event::emit_event(&mut auction_store.auction_cancelled_events, AuctionCancelledEvent {
            auction_id,
            seller: seller_addr,
            timestamp: timestamp::now_seconds(),
        });
    }

    #[view]
    public fun is_auction_active(auction_id: u64): bool acquires AuctionStore {
        if (!exists<AuctionStore>(@unite_defi)) {
            return false
        };
        
        let auction_store = borrow_global<AuctionStore>(@unite_defi);
        if (!table::contains(&auction_store.auctions, auction_id)) {
            return false
        };
        
        let auction = table::borrow(&auction_store.auctions, auction_id);
        let current_time = timestamp::now_seconds();
        
        auction.active && (current_time - auction.start_time <= auction.duration)
    }

    #[view]
    public fun get_auction_details(auction_id: u64): (address, u64, u64, u64, u64, u64, bool, vector<u8>) acquires AuctionStore {
        assert!(exists<AuctionStore>(@unite_defi), E_NOT_INITIALIZED);
        let auction_store = borrow_global<AuctionStore>(@unite_defi);
        assert!(table::contains(&auction_store.auctions, auction_id), E_AUCTION_NOT_FOUND);
        
        let auction = table::borrow(&auction_store.auctions, auction_id);
        (
            auction.seller,
            auction.token_amount,
            auction.start_price,
            auction.end_price,
            auction.start_time,
            auction.duration,
            auction.active,
            auction.hash_secret
        )
    }
}