use starknet::ContractAddress;

#[starknet::interface]
trait IERC20<TContractState> {
    fn name(self: @TContractState) -> felt252;
    fn symbol(self: @TContractState) -> felt252;
    fn decimals(self: @TContractState) -> u8;
    fn total_supply(self: @TContractState) -> u256;
    fn balance_of(self: @TContractState, account: ContractAddress) -> u256;
    fn allowance(self: @TContractState, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn transfer(ref self: TContractState, to: ContractAddress, amount: u256) -> bool;
    fn transfer_from(
        ref self: TContractState, from: ContractAddress, to: ContractAddress, amount: u256
    ) -> bool;
    fn approve(ref self: TContractState, spender: ContractAddress, amount: u256) -> bool;
}

#[starknet::interface]
trait IERC20Mintable<TContractState> {
    fn mint(ref self: TContractState, to: ContractAddress, amount: u256);
}

use starknet::{ContractAddress};

#[derive(Copy, Drop, Serde, starknet::Store)]
pub struct IERC20Dispatcher {
    pub contract_address: ContractAddress
}

pub trait IERC20DispatcherTrait {
    fn name(self: IERC20Dispatcher) -> felt252;
    fn symbol(self: IERC20Dispatcher) -> felt252;
    fn decimals(self: IERC20Dispatcher) -> u8;
    fn total_supply(self: IERC20Dispatcher) -> u256;
    fn balance_of(self: IERC20Dispatcher, account: ContractAddress) -> u256;
    fn allowance(self: IERC20Dispatcher, owner: ContractAddress, spender: ContractAddress) -> u256;
    fn transfer(self: IERC20Dispatcher, to: ContractAddress, amount: u256) -> bool;
    fn transfer_from(self: IERC20Dispatcher, from: ContractAddress, to: ContractAddress, amount: u256) -> bool;
    fn approve(self: IERC20Dispatcher, spender: ContractAddress, amount: u256) -> bool;
}

pub impl IERC20DispatcherImpl of IERC20DispatcherTrait {
    fn name(self: IERC20Dispatcher) -> felt252 {
        let mut call_data = ArrayTrait::new();
        match starknet::call_contract_syscall(
            self.contract_address, selector!("name"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }

    fn symbol(self: IERC20Dispatcher) -> felt252 {
        let mut call_data = ArrayTrait::new();
        match starknet::call_contract_syscall(
            self.contract_address, selector!("symbol"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }

    fn decimals(self: IERC20Dispatcher) -> u8 {
        let mut call_data = ArrayTrait::new();
        match starknet::call_contract_syscall(
            self.contract_address, selector!("decimals"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }

    fn total_supply(self: IERC20Dispatcher) -> u256 {
        let mut call_data = ArrayTrait::new();
        match starknet::call_contract_syscall(
            self.contract_address, selector!("total_supply"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }

    fn balance_of(self: IERC20Dispatcher, account: ContractAddress) -> u256 {
        let mut call_data = ArrayTrait::new();
        call_data.append(account.into());
        match starknet::call_contract_syscall(
            self.contract_address, selector!("balance_of"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }

    fn allowance(self: IERC20Dispatcher, owner: ContractAddress, spender: ContractAddress) -> u256 {
        let mut call_data = ArrayTrait::new();
        call_data.append(owner.into());
        call_data.append(spender.into());
        match starknet::call_contract_syscall(
            self.contract_address, selector!("allowance"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }

    fn transfer(self: IERC20Dispatcher, to: ContractAddress, amount: u256) -> bool {
        let mut call_data = ArrayTrait::new();
        Serde::serialize(@to, ref call_data);
        Serde::serialize(@amount, ref call_data);
        match starknet::call_contract_syscall(
            self.contract_address, selector!("transfer"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }

    fn transfer_from(self: IERC20Dispatcher, from: ContractAddress, to: ContractAddress, amount: u256) -> bool {
        let mut call_data = ArrayTrait::new();
        Serde::serialize(@from, ref call_data);
        Serde::serialize(@to, ref call_data);
        Serde::serialize(@amount, ref call_data);
        match starknet::call_contract_syscall(
            self.contract_address, selector!("transfer_from"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }

    fn approve(self: IERC20Dispatcher, spender: ContractAddress, amount: u256) -> bool {
        let mut call_data = ArrayTrait::new();
        Serde::serialize(@spender, ref call_data);
        Serde::serialize(@amount, ref call_data);
        match starknet::call_contract_syscall(
            self.contract_address, selector!("approve"), call_data.span()
        ) {
            Result::Ok(mut retdata) => Serde::deserialize(ref retdata).unwrap(),
            Result::Err(revert_reason) => panic_with_felt252(*revert_reason.at(0))
        }
    }
}