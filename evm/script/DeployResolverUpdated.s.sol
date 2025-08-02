// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/Resolver.sol";

contract DeployResolverUpdated is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        console.log("Deployer address:", deployerAddress);
        
        // Get existing contract addresses from environment
        address escrowFactory = vm.envAddress("ESCROW_FACTORY");
        address limitOrderProtocol = vm.envAddress("LIMIT_ORDER_PROTOCOL");
        address resolverOwner = vm.envAddress("RESOLVER_OWNER");
        
        console.log("EscrowFactory:", escrowFactory);
        console.log("LimitOrderProtocol:", limitOrderProtocol);
        console.log("Resolver Owner:", resolverOwner);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy new Resolver contract
        Resolver resolver = new Resolver(
            IEscrowFactory(escrowFactory),
            IOrderMixin(limitOrderProtocol),
            resolverOwner
        );
        
        console.log("New Resolver deployed at:", address(resolver));
        
        vm.stopBroadcast();
    }
}