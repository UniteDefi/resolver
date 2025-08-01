// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "forge-std/Script.sol";
import "../src/Resolver.sol";
import "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import "../lib/cross-chain-swap/lib/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";

contract DeployTestResolver is Script {
    function run() external {
        // Read deployments
        string memory deployments = vm.readFile("/Users/gabrielantonyxaviour/Documents/projects/unite-defi/resolver/deployments.json");
        
        // Deploy on Sepolia
        deployOnChain(11155111, "eth_sepolia", deployments);
        
        // Deploy on Base Sepolia
        deployOnChain(84532, "base_sepolia", deployments);
        
        // Deploy on Arbitrum Sepolia
        deployOnChain(421614, "arb_sepolia", deployments);
    }
    
    function deployOnChain(uint256 chainId, string memory chainSlug, string memory deployments) internal {
        // Get RPC URL from environment
        string memory rpcEnvVar;
        if (keccak256(bytes(chainSlug)) == keccak256(bytes("eth_sepolia"))) {
            rpcEnvVar = "SEPOLIA_RPC_URL";
        } else if (keccak256(bytes(chainSlug)) == keccak256(bytes("base_sepolia"))) {
            rpcEnvVar = "BASE_SEPOLIA_RPC_URL";
        } else if (keccak256(bytes(chainSlug)) == keccak256(bytes("arb_sepolia"))) {
            rpcEnvVar = "ARBITRUM_SEPOLIA_RPC_URL";
        } else {
            revert("Unknown chain");
        }
        string memory rpcUrl = vm.envString(rpcEnvVar);
        vm.createSelectFork(rpcUrl);
        
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