#[starknet::interface]
trait ICounter<TContractState> {
    fn increase_counter(ref self: TContractState);
    fn decrease_counter(ref self: TContractState);
    fn get_counter(self: @TContractState) -> u32;
}

#[starknet::contract]
mod Counter {
    use starknet::ContractAddress;
    use starknet::get_caller_address;

    #[storage]
    struct Storage {
        counter: u32,
        owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        CounterIncreased: CounterIncreased,
        CounterDecreased: CounterDecreased,
    }

    #[derive(Drop, starknet::Event)]
    struct CounterIncreased {
        #[key]
        caller: ContractAddress,
        new_value: u32,
    }

    #[derive(Drop, starknet::Event)]
    struct CounterDecreased {
        #[key]
        caller: ContractAddress,
        new_value: u32,
    }

    #[constructor]
    fn constructor(ref self: ContractState, initial_value: u32) {
        self.counter.write(initial_value);
        self.owner.write(get_caller_address());
    }

    #[abi(embed_v0)]
    impl CounterImpl of super::ICounter<ContractState> {
        fn increase_counter(ref self: ContractState) {
            let current_value = self.counter.read();
            let new_value = current_value + 1;
            self.counter.write(new_value);
            
            self.emit(CounterIncreased {
                caller: get_caller_address(),
                new_value: new_value,
            });
        }

        fn decrease_counter(ref self: ContractState) {
            let current_value = self.counter.read();
            assert(current_value > 0, 'Counter cannot go below zero');
            let new_value = current_value - 1;
            self.counter.write(new_value);
            
            self.emit(CounterDecreased {
                caller: get_caller_address(),
                new_value: new_value,
            });
        }

        fn get_counter(self: @ContractState) -> u32 {
            self.counter.read()
        }
    }

    #[generate_trait]
    impl InternalFunctions of InternalFunctionsTrait {
        fn get_owner(self: @ContractState) -> ContractAddress {
            self.owner.read()
        }
    }
}