// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import {Script, console} from "forge-std/Script.sol";
import {SimpleDutchAuction} from "../../contracts/src/SimpleDutchAuction.sol";
import {EscrowFactory} from "../../contracts/lib/cross-chain-swap/contracts/EscrowFactory.sol";
import {MockToken} from "../../contracts/src/MockToken.sol";

contract DeployEtherlinkBase is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Deploy on Etherlink
        console.log("Deploying contracts on Etherlink...");
        vm.createSelectFork(vm.rpcUrl("etherlink"));
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockToken tokenOnEtherlink = new MockToken("USDC on Etherlink", "USDC.e", 6);
        console.log("Token on Etherlink deployed at:", address(tokenOnEtherlink));
        
        SimpleDutchAuction auction = new SimpleDutchAuction();
        console.log("Dutch Auction deployed at:", address(auction));
        
        EscrowFactory escrowFactoryEtherlink = new EscrowFactory(
            address(0), // no access token
            address(0), // native token for src
            address(0), // native token for dst
            msg.sender, // owner
            7 days,     // rescue delay src
            7 days      // rescue delay dst
        );
        console.log("Escrow Factory on Etherlink deployed at:", address(escrowFactoryEtherlink));
        
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
        console.log("Etherlink:");
        console.log("  Token:", address(tokenOnEtherlink));
        console.log("  Auction:", address(auction));
        console.log("  EscrowFactory:", address(escrowFactoryEtherlink));
        console.log("\nBase Sepolia:");
        console.log("  Token:", address(tokenOnBase));
        console.log("  EscrowFactory:", address(escrowFactoryBase));
    }
}