// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/UniteLimitOrderProtocol.sol";
import "../src/UniteEscrowFactory.sol";
import "../src/UniteResolver.sol";

contract FundAndDeploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying Unite contracts with deployer:", deployer);
        console.log("Deployer balance:", deployer.balance);
        
        // If balance is too low, this will revert with insufficient funds
        if (deployer.balance < 0.01 ether) {
            console.log("WARNING: Deployer balance is very low!");
            console.log("Please fund the deployer address with some ETH");
            console.log("Deployer address:", deployer);
            return;
        }
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy UniteLimitOrderProtocol
        UniteLimitOrderProtocol lop = new UniteLimitOrderProtocol();
        console.log("UniteLimitOrderProtocol deployed at:", address(lop));
        
        // Deploy UniteEscrowFactory
        UniteEscrowFactory factory = new UniteEscrowFactory(deployer);
        console.log("UniteEscrowFactory deployed at:", address(factory));
        
        // Deploy UniteResolver
        UniteResolver resolver = new UniteResolver(factory, lop, deployer);
        console.log("UniteResolver deployed at:", address(resolver));
        
        vm.stopBroadcast();
        
        console.log("\nDeployment complete!");
        console.log("Chain:", getChainName());
        console.log("====================");
        
        // Log deployment info for easy copy-paste
        console.log("\nUpdate deployments.json:");
        console.log('"UniteLimitOrderProtocol":', '"', vm.toString(address(lop)), '",');
        console.log('"UniteEscrowFactory":', '"', vm.toString(address(factory)), '",');
        console.log('"UniteResolver":', '"', vm.toString(address(resolver)), '",');
    }
    
    function getChainName() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arbitrum_sepolia";
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 10143) return "monad_testnet";
        revert("Unsupported chain");
    }
}