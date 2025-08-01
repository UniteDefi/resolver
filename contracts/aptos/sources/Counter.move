module counter_addr::counter {
    use std::signer;
    use aptos_framework::event::{Self, EventHandle};
    use aptos_framework::account;

    struct Counter has key {
        value: u64,
        increment_events: EventHandle<IncrementEvent>,
        decrement_events: EventHandle<DecrementEvent>,
    }

    struct IncrementEvent has drop, store {
        old_value: u64,
        new_value: u64,
    }

    struct DecrementEvent has drop, store {
        old_value: u64,
        new_value: u64,
    }

    const E_NOT_INITIALIZED: u64 = 1;
    const E_UNDERFLOW: u64 = 2;

    public entry fun initialize(account_signer: &signer) {
        let counter = Counter {
            value: 0,
            increment_events: account::new_event_handle<IncrementEvent>(account_signer),
            decrement_events: account::new_event_handle<DecrementEvent>(account_signer),
        };
        move_to(account_signer, counter);
    }

    public entry fun increment(account: &signer) acquires Counter {
        let account_addr = signer::address_of(account);
        assert!(exists<Counter>(account_addr), E_NOT_INITIALIZED);
        
        let counter = borrow_global_mut<Counter>(account_addr);
        let old_value = counter.value;
        counter.value = counter.value + 1;
        
        event::emit_event(&mut counter.increment_events, IncrementEvent {
            old_value,
            new_value: counter.value,
        });
    }

    public entry fun decrement(account: &signer) acquires Counter {
        let account_addr = signer::address_of(account);
        assert!(exists<Counter>(account_addr), E_NOT_INITIALIZED);
        
        let counter = borrow_global_mut<Counter>(account_addr);
        assert!(counter.value > 0, E_UNDERFLOW);
        
        let old_value = counter.value;
        counter.value = counter.value - 1;
        
        event::emit_event(&mut counter.decrement_events, DecrementEvent {
            old_value,
            new_value: counter.value,
        });
    }

    #[view]
    public fun get_value(account_addr: address): u64 acquires Counter {
        assert!(exists<Counter>(account_addr), E_NOT_INITIALIZED);
        borrow_global<Counter>(account_addr).value
    }
}