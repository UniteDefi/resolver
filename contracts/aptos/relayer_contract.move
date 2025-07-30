module unite_defi::relayer_contract {
    use std::signer;
    use std::vector;
    use aptos_framework::coin::{Self, Coin};
    use aptos_framework::timestamp;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::account;
    use aptos_std::table::{Self, Table};
    use aptos_std::hash;
    use unite_defi::escrow_factory;

    // Error codes
    const E_NOT_INITIALIZED: u64 = 1;
    const E_ALREADY_INITIALIZED: u64 = 2;
    const E_NOT_AUTHORIZED: u64 = 3;
    const E_ORDER_EXISTS: u64 = 4;
    const E_ORDER_NOT_FOUND: u64 = 5;

    // Order states
    const ORDER_CREATED: u8 = 0;
    const ORDER_COMMITTED: u8 = 1;
    const ORDER_ESCROWS_DEPLOYED: u8 = 2;
    const ORDER_COMPLETED: u8 = 3;

    struct RelayerContract has key {
        orders: Table<vector<u8>, OrderInfo>,
        order_created_events: EventHandle<OrderCreatedEvent>,
        order_completed_events: EventHandle<OrderCompletedEvent>,
    }

    struct OrderInfo has store {
        user: address,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        state: u8,
        created_at: u64,
    }

    struct OrderCreatedEvent has drop, store {
        order_id: vector<u8>,
        user: address,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
        timestamp: u64,
    }

    struct OrderCompletedEvent has drop, store {
        order_id: vector<u8>,
        secret: vector<u8>,
        timestamp: u64,
    }

    public entry fun initialize(deployer: &signer) {
        let deployer_addr = signer::address_of(deployer);
        assert!(!exists<RelayerContract>(deployer_addr), E_ALREADY_INITIALIZED);
        
        let contract = RelayerContract {
            orders: table::new(),
            order_created_events: account::new_event_handle<OrderCreatedEvent>(deployer),
            order_completed_events: account::new_event_handle<OrderCompletedEvent>(deployer),
        };
        
        move_to(deployer, contract);
    }

    // Called by authorized relayer to register a new order
    public entry fun register_order(
        relayer: &signer,
        order_id: vector<u8>,
        user: address,
        src_amount: u64,
        dst_amount: u64,
        src_chain_id: u64,
        dst_chain_id: u64,
    ) acquires RelayerContract {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<RelayerContract>(@unite_defi), E_NOT_INITIALIZED);
        
        // Verify relayer is authorized in escrow factory
        assert!(escrow_factory::is_authorized_relayer(relayer_addr), E_NOT_AUTHORIZED);
        
        let contract = borrow_global_mut<RelayerContract>(@unite_defi);
        assert!(!table::contains(&contract.orders, order_id), E_ORDER_EXISTS);
        
        let order = OrderInfo {
            user,
            src_amount,
            dst_amount,
            src_chain_id,
            dst_chain_id,
            state: ORDER_CREATED,
            created_at: timestamp::now_seconds(),
        };
        
        table::add(&mut contract.orders, order_id, order);
        
        // Also register in escrow factory
        escrow_factory::register_order(
            relayer,
            order_id,
            user,
            src_amount,
            dst_amount,
            src_chain_id,
            dst_chain_id,
        );
        
        event::emit_event(&mut contract.order_created_events, OrderCreatedEvent {
            order_id,
            user,
            src_amount,
            dst_amount,
            src_chain_id,
            dst_chain_id,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Called after resolver commits and escrows are deployed
    public entry fun update_order_state(
        relayer: &signer,
        order_id: vector<u8>,
        new_state: u8,
    ) acquires RelayerContract {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<RelayerContract>(@unite_defi), E_NOT_INITIALIZED);
        assert!(escrow_factory::is_authorized_relayer(relayer_addr), E_NOT_AUTHORIZED);
        
        let contract = borrow_global_mut<RelayerContract>(@unite_defi);
        assert!(table::contains(&contract.orders, order_id), E_ORDER_NOT_FOUND);
        
        let order = table::borrow_mut(&mut contract.orders, order_id);
        order.state = new_state;
    }

    // Called to complete order with secret
    public entry fun complete_order(
        relayer: &signer,
        order_id: vector<u8>,
        secret: vector<u8>,
    ) acquires RelayerContract {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<RelayerContract>(@unite_defi), E_NOT_INITIALIZED);
        assert!(escrow_factory::is_authorized_relayer(relayer_addr), E_NOT_AUTHORIZED);
        
        let contract = borrow_global_mut<RelayerContract>(@unite_defi);
        assert!(table::contains(&contract.orders, order_id), E_ORDER_NOT_FOUND);
        
        let order = table::borrow_mut(&mut contract.orders, order_id);
        order.state = ORDER_COMPLETED;
        
        // Also complete in escrow factory
        escrow_factory::complete_order(relayer, order_id, secret);
        
        event::emit_event(&mut contract.order_completed_events, OrderCompletedEvent {
            order_id,
            secret,
            timestamp: timestamp::now_seconds(),
        });
    }

    // Called by authorized relayer to transfer pre-approved user funds to escrow
    public entry fun transfer_user_funds_to_escrow<CoinType>(
        relayer: &signer,
        order_id: vector<u8>,
        maker: address,
        taker: address,
        token_amount: u64,
        hashlock: vector<u8>,
        withdrawal_deadline: u64,
        public_withdrawal_deadline: u64,
        cancellation_deadline: u64,
        public_cancellation_deadline: u64,
        is_source: bool,
    ) acquires RelayerContract {
        let relayer_addr = signer::address_of(relayer);
        assert!(exists<RelayerContract>(@unite_defi), E_NOT_INITIALIZED);
        assert!(escrow_factory::is_authorized_relayer(relayer_addr), E_NOT_AUTHORIZED);
        
        let contract = borrow_global_mut<RelayerContract>(@unite_defi);
        assert!(table::contains(&contract.orders, order_id), E_ORDER_NOT_FOUND);
        
        // Transfer funds through escrow factory
        escrow_factory::create_escrow_and_transfer_funds<CoinType>(
            relayer,
            order_id,
            maker,
            taker,
            token_amount,
            hashlock,
            withdrawal_deadline,
            public_withdrawal_deadline,
            cancellation_deadline,
            public_cancellation_deadline,
            is_source,
        );
        
        // Update order state
        let order = table::borrow_mut(&mut contract.orders, order_id);
        if (order.state == ORDER_COMMITTED) {
            order.state = ORDER_ESCROWS_DEPLOYED;
        };
    }

    #[view]
    public fun get_order(order_id: vector<u8>): (address, u64, u64, u64, u64, u8) acquires RelayerContract {
        assert!(exists<RelayerContract>(@unite_defi), E_NOT_INITIALIZED);
        let contract = borrow_global<RelayerContract>(@unite_defi);
        
        if (table::contains(&contract.orders, order_id)) {
            let order = table::borrow(&contract.orders, order_id);
            (order.user, order.src_amount, order.dst_amount, order.src_chain_id, order.dst_chain_id, order.state)
        } else {
            (@0x0, 0, 0, 0, 0, 0)
        }
    }
}