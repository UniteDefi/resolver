// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/Resolver.sol";
import "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import "../lib/cross-chain-swap/lib/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";

contract DeployResolverSingle is Script {
    function run() external {
        // Read deployments
        string memory deployments = vm.readFile("deployments.json");
        
        // Get chain info from environment
        string memory chainSlug = vm.envString("CHAIN_SLUG");
        
        // Get resolver private key
        uint256 deployerPrivateKey = vm.envUint("RESOLVER_PRIVATE_KEY_0");
        address deployerAddress = vm.addr(deployerPrivateKey);
        
        console.log("Deploying on chain:", chainSlug);
        console.log("Deployer address:", deployerAddress);
        
        // Parse addresses from deployments
        string memory chainPath = string.concat(".evm.", chainSlug);
        address escrowFactory = vm.parseJsonAddress(deployments, string.concat(chainPath, ".UniteEscrowFactory"));
        address limitOrderProtocol = vm.parseJsonAddress(deployments, string.concat(chainPath, ".LimitOrderProtocol"));
        
        console.log("EscrowFactory:", escrowFactory);
        console.log("LimitOrderProtocol:", limitOrderProtocol);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy new Resolver contract with the deployer as owner
        Resolver resolver = new Resolver(
            IEscrowFactory(escrowFactory),
            IOrderMixin(limitOrderProtocol),
            deployerAddress
        );
        
        console.log("New Resolver deployed at:", address(resolver));
        
        vm.stopBroadcast();
    }
}