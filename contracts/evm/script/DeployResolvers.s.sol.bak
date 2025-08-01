// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {Resolver} from "../src/Resolver.sol";
import {IEscrowFactory} from "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import {IOrderMixin} from "../lib/cross-chain-swap/lib/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";

contract DeployResolvers is Script {
    function run(address factory, address lop) external returns (address[4] memory resolvers) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);
        
        console.log("Deploying 4 Resolver contracts...");
        
        // Read resolver wallet addresses from environment
        address[4] memory resolverWallets = [
            vm.envAddress("RESOLVER_WALLET_0"),
            vm.envAddress("RESOLVER_WALLET_1"),
            vm.envAddress("RESOLVER_WALLET_2"),
            vm.envAddress("RESOLVER_WALLET_3")
        ];
        
        for (uint i = 0; i < 4; i++) {
            // Use the resolver wallet address as the owner
            address resolverOwner = resolverWallets[i];
            
            Resolver resolver = new Resolver(
                IEscrowFactory(factory),
                IOrderMixin(lop),
                resolverOwner
            );
            resolvers[i] = address(resolver);
            console.log("  Resolver", i + 1, "deployed at:", address(resolver));
            console.log("    Owner:", resolverOwner);
        }
        
        vm.stopBroadcast();
        
        return resolvers;
    }
}