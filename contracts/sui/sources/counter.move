module counter::counter {
    use sui::object::{Self, UID};
    use sui::transfer;
    use sui::tx_context::TxContext;

    struct Counter has key {
        id: UID,
        value: u64,
    }

    fun init(ctx: &mut TxContext) {
        let counter = Counter {
            id: object::new(ctx),
            value: 0,
        };
        transfer::share_object(counter);
    }

    public entry fun increment(counter: &mut Counter) {
        counter.value = counter.value + 1;
    }

    public entry fun decrement(counter: &mut Counter) {
        assert!(counter.value > 0, 0);
        counter.value = counter.value - 1;
    }

    public fun get_value(counter: &Counter): u64 {
        counter.value
    }
}