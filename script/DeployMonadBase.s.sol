// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {SimpleDutchAuction} from "../contracts/src/SimpleDutchAuction.sol";
import {EscrowFactory} from "../contracts/lib/cross-chain-swap/contracts/EscrowFactory.sol";
import {MockToken} from "../contracts/src/MockToken.sol";

contract DeployMonadBase is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Deploy on Monad
        console.log("Deploying contracts on Monad...");
        vm.createSelectFork(vm.rpcUrl("monad"));
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockToken tokenOnMonad = new MockToken("USDC on Monad", "USDC.m", 6);
        console.log("Token on Monad deployed at:", address(tokenOnMonad));
        
        SimpleDutchAuction auction = new SimpleDutchAuction();
        console.log("Dutch Auction deployed at:", address(auction));
        
        EscrowFactory escrowFactoryMonad = new EscrowFactory(
            address(0), // no access token
            address(0), // native token for src
            address(0), // native token for dst
            msg.sender, // owner
            7 days,     // rescue delay src
            7 days      // rescue delay dst
        );
        console.log("Escrow Factory on Monad deployed at:", address(escrowFactoryMonad));
        
        vm.stopBroadcast();
        
        // Deploy on Base Sepolia
        console.log("\nDeploying contracts on Base Sepolia...");
        vm.createSelectFork(vm.rpcUrl("base_sepolia"));
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockToken tokenOnBase = new MockToken("USDC on Base", "USDC.b", 6);
        console.log("Token on Base deployed at:", address(tokenOnBase));
        
        EscrowFactory escrowFactoryBase = new EscrowFactory(
            address(0), // no access token
            address(0), // native token for src
            address(0), // native token for dst
            msg.sender, // owner
            7 days,     // rescue delay src
            7 days      // rescue delay dst
        );
        console.log("Escrow Factory on Base deployed at:", address(escrowFactoryBase));
        
        vm.stopBroadcast();
        
        // Save deployment addresses
        console.log("\n=== Deployment Summary ===");
        console.log("Monad:");
        console.log("  Token:", address(tokenOnMonad));
        console.log("  Auction:", address(auction));
        console.log("  EscrowFactory:", address(escrowFactoryMonad));
        console.log("\nBase Sepolia:");
        console.log("  Token:", address(tokenOnBase));
        console.log("  EscrowFactory:", address(escrowFactoryBase));
    }
}