// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {SimpleDutchAuction} from "../../contracts/src/SimpleDutchAuction.sol";
import {EscrowFactory} from "../../contracts/lib/cross-chain-swap/contracts/EscrowFactory.sol";
import {MockToken} from "../../contracts/src/MockToken.sol";

contract Deploy is Script {
    function run() external returns (MockToken, SimpleDutchAuction, EscrowFactory, MockToken, EscrowFactory) {
        vm.startBroadcast();

        // Deploy on Monad
        vm.selectFork(vm.createSelectFork("monad"));
        MockToken tokenOnMonad = new MockToken("Mock Token on Monad", "MTM", 18);
        SimpleDutchAuction auction = new SimpleDutchAuction();
        EscrowFactory escrowFactoryOnMonad = new EscrowFactory(address(0), tokenOnMonad, tokenOnMonad, address(this), 0, 0);

        // Deploy on Base Sepolia
        vm.selectFork(vm.createSelectFork("base_sepolia"));
        MockToken tokenOnBaseSepolia = new MockToken("Mock Token on Base Sepolia", "MTB", 18);
        EscrowFactory escrowFactoryOnBaseSepolia = new EscrowFactory(address(0), tokenOnBaseSepolia, tokenOnBaseSepolia, address(this), 0, 0);

        vm.stopBroadcast();

        return (tokenOnMonad, auction, escrowFactoryOnMonad, tokenOnBaseSepolia, escrowFactoryOnBaseSepolia);
    }
}
