// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/one-inch/LimitOrderProtocol.sol";
import "../src/SimpleEscrowFactory.sol";
import "../src/SimpleResolver.sol";

contract DeploySimpleSwap is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying contracts with deployer:", deployer);
        console.log("Deployer balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy LimitOrderProtocol
        LimitOrderProtocol lop = new LimitOrderProtocol();
        console.log("LimitOrderProtocol deployed at:", address(lop));
        
        // Deploy SimpleEscrowFactory
        SimpleEscrowFactory factory = new SimpleEscrowFactory(deployer);
        console.log("SimpleEscrowFactory deployed at:", address(factory));
        
        // Deploy SimpleResolver
        SimpleResolver resolver = new SimpleResolver(factory, lop, deployer);
        console.log("SimpleResolver deployed at:", address(resolver));
        
        vm.stopBroadcast();
        
        console.log("\nDeployment complete!");
        console.log("Chain:", getChainName());
        console.log("====================");
    }
    
    function getChainName() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arbitrum_sepolia";
        revert("Unsupported chain");
    }
}