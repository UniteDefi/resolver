module unite_resolver::escrow_factory {
    use std::signer;
    use std::vector;
    use aptos_framework::event;
    use aptos_framework::account;
    
    struct EscrowFactory has key {
        escrow_count: u64,
        escrows: vector<address>,
    }

    struct FactoryEvents has key {
        escrow_deployed_events: event::EventHandle<EscrowDeployedEvent>,
    }

    struct EscrowDeployedEvent has drop, store {
        escrow_address: address,
        src_chain_id: u64,
        dst_chain_id: u64,
        escrow_id: vector<u8>,
    }

    public fun initialize(admin: &signer) {
        move_to(admin, EscrowFactory {
            escrow_count: 0,
            escrows: vector::empty(),
        });
        
        move_to(admin, FactoryEvents {
            escrow_deployed_events: event::new_event_handle<EscrowDeployedEvent>(admin),
        });
    }

    public entry fun deploy_escrow(
        deployer: &signer,
        src_chain_id: u64,
        dst_chain_id: u64,
        escrow_id: vector<u8>,
    ) acquires EscrowFactory, FactoryEvents {
        let factory = borrow_global_mut<EscrowFactory>(@unite_resolver);
        
        // Create a new account for the escrow
        let (escrow_signer, escrow_cap) = account::create_resource_account(deployer, escrow_id);
        let escrow_address = signer::address_of(&escrow_signer);
        
        // Track the escrow
        vector::push_back(&mut factory.escrows, escrow_address);
        factory.escrow_count = factory.escrow_count + 1;
        
        // Emit event
        let events = borrow_global_mut<FactoryEvents>(@unite_resolver);
        event::emit_event(&mut events.escrow_deployed_events, EscrowDeployedEvent {
            escrow_address,
            src_chain_id,
            dst_chain_id,
            escrow_id,
        });
    }

    #[view]
    public fun get_escrow_count(): u64 acquires EscrowFactory {
        borrow_global<EscrowFactory>(@unite_resolver).escrow_count
    }

    #[view]
    public fun get_escrow_at_index(index: u64): address acquires EscrowFactory {
        let factory = borrow_global<EscrowFactory>(@unite_resolver);
        *vector::borrow(&factory.escrows, index)
    }
}