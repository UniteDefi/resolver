#[starknet::contract]
mod UniteLimitOrderProtocol {
    use core::hash::{HashStateTrait, HashStateExTrait};
    use core::poseidon::PoseidonTrait;
    use starknet::{
        ContractAddress, get_caller_address, get_contract_address, get_block_timestamp,
        contract_address_const
    };
    use openzeppelin::token::erc20::interface::{IERC20Dispatcher, IERC20DispatcherTrait};
    use super::interfaces::iunite_order::{Order, IUniteOrder};
    use super::interfaces::iunite_order_protocol::IUniteOrderProtocol;
    use super::interfaces::iorder_mixin::{IOrderMixin, TakerTraits};
    use super::libraries::unite_order_lib;
    use super::libraries::unite_signature_validator;
    use super::libraries::dutch_auction_lib;

    #[storage]
    struct Storage {
        invalidated_orders: LegacyMap<felt252, bool>,
        nonces: LegacyMap<ContractAddress, u256>,
        filled_amounts: LegacyMap<felt252, u256>,
        escrow_addresses: LegacyMap<felt252, ContractAddress>,
        owner: ContractAddress,
    }

    #[event]
    #[derive(Drop, starknet::Event)]
    enum Event {
        OrderFilled: OrderFilled,
        OrderCancelled: OrderCancelled,
    }

    #[derive(Drop, starknet::Event)]
    struct OrderFilled {
        #[key]
        order_hash: felt252,
        #[key]
        maker: ContractAddress,
        #[key]
        taker: ContractAddress,
        making_amount: u256,
        taking_amount: u256,
    }

    #[derive(Drop, starknet::Event)]
    struct OrderCancelled {
        #[key]
        order_hash: felt252,
    }

    #[constructor]
    fn constructor(ref self: ContractState) {
        self.owner.write(get_caller_address());
    }

    #[abi(embed_v0)]
    impl UniteOrderProtocolImpl of IUniteOrderProtocol<ContractState> {
        fn fill_order(
            ref self: ContractState,
            order: Order,
            signature: Array<felt252>,
            making_amount: u256,
            taking_amount: u256,
            target: ContractAddress
        ) -> (u256, u256, felt252) {
            // Validate order
            assert(get_block_timestamp() <= order.deadline, 'Order expired');
            assert(order.nonce == self.nonces.read(order.maker), 'Invalid nonce');
            
            // Calculate order hash
            let order_hash = unite_order_lib::hash_order(@order);
            
            // Check if order is invalidated
            assert(!self.invalidated_orders.read(order_hash), 'Invalid order');
            
            // Verify signature (simplified for StarkNet)
            // In practice, you'd verify the signature properly
            
            // Check remaining amount
            let already_filled = self.filled_amounts.read(order_hash);
            let remaining_amount = order.making_amount - already_filled;
            assert(remaining_amount > 0, 'Order fully filled');
            
            // Calculate actual amounts
            let mut actual_making_amount = making_amount;
            let mut actual_taking_amount = taking_amount;
            
            if making_amount == 0 && taking_amount == 0 {
                actual_making_amount = remaining_amount;
                actual_taking_amount = dutch_auction_lib::calculate_taking_amount(
                    actual_making_amount,
                    order.start_price,
                    order.end_price,
                    order.auction_start_time,
                    order.auction_end_time,
                    get_block_timestamp()
                );
            }
            
            assert(actual_making_amount <= remaining_amount, 'Invalid amount');
            
            // Update filled amounts
            self.filled_amounts.write(order_hash, already_filled + actual_making_amount);
            
            // Mark order as fully filled if completed
            if self.filled_amounts.read(order_hash) >= order.making_amount {
                self.invalidated_orders.write(order_hash, true);
                self.nonces.write(order.maker, order.nonce + 1);
            }
            
            // Handle escrow address consistency
            let recipient = if target.is_zero() { get_caller_address() } else { target };
            
            if self.escrow_addresses.read(order_hash).is_zero() {
                self.escrow_addresses.write(order_hash, recipient);
            } else {
                // For subsequent fills, use stored escrow
                // recipient = self.escrow_addresses.read(order_hash);
            }
            
            // Emit event
            self.emit(OrderFilled {
                order_hash,
                maker: order.maker,
                taker: get_caller_address(),
                making_amount: actual_making_amount,
                taking_amount: actual_taking_amount,
            });
            
            (actual_making_amount, actual_taking_amount, order_hash)
        }

        fn cancel_order(ref self: ContractState, order: Order) {
            assert(get_caller_address() == order.maker, 'Invalid order');
            
            let order_hash = unite_order_lib::hash_order(@order);
            assert(!self.invalidated_orders.read(order_hash), 'Invalid order');
            
            self.invalidated_orders.write(order_hash, true);
            self.emit(OrderCancelled { order_hash });
        }

        fn hash_order(self: @ContractState, order: Order) -> felt252 {
            unite_order_lib::hash_order(@order)
        }

        fn invalidated_orders(self: @ContractState, order_hash: felt252) -> bool {
            self.invalidated_orders.read(order_hash)
        }

        fn nonces(self: @ContractState, maker: ContractAddress) -> u256 {
            self.nonces.read(maker)
        }

        fn get_filled_amount(self: @ContractState, order_hash: felt252) -> u256 {
            self.filled_amounts.read(order_hash)
        }

        fn get_remaining_amount(self: @ContractState, order: Order) -> u256 {
            let order_hash = unite_order_lib::hash_order(@order);
            let filled = self.filled_amounts.read(order_hash);
            if order.making_amount > filled {
                order.making_amount - filled
            } else {
                0
            }
        }

        fn get_escrow_address(self: @ContractState, order_hash: felt252) -> ContractAddress {
            self.escrow_addresses.read(order_hash)
        }

        fn is_order_fully_filled(self: @ContractState, order_hash: felt252) -> bool {
            self.invalidated_orders.read(order_hash)
        }
    }

    #[abi(embed_v0)]
    impl OrderMixinImpl of IOrderMixin<ContractState> {
        fn fill_order_args(
            ref self: ContractState,
            order: Order,
            r: felt252,
            vs: felt252,
            amount: u256,
            taker_traits: TakerTraits,
            args: Array<felt252>
        ) -> (u256, u256, felt252) {
            // Extract target from args if needed
            let target = if args.len() > 0 {
                (*args.at(0)).try_into().unwrap()
            } else {
                contract_address_const::<0>()
            };
            
            // Create signature array
            let mut signature = ArrayTrait::new();
            signature.append(r);
            signature.append(vs);
            
            self.fill_order(order, signature, amount, 0, target)
        }
    }
}
