// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {UniteEscrowFactory} from "../src/UniteEscrowFactory.sol";
import "forge-std/StdJson.sol";

contract AuthorizeRelayers is Script {
    using stdJson for string;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address relayerAddress = vm.envAddress("RELAYER_WALLET_ADDRESS");
        
        // Read deployments.json to get factory addresses
        string memory json = vm.readFile("deployments.json");
        
        // Get factory address for current chain
        string memory chainKey = getChainKey(block.chainid);
        string memory factoryKey = string.concat(".", chainKey, ".contracts.uniteEscrowFactory.address");
        address factoryAddress = json.readAddress(factoryKey);
        
        console.log("Authorizing relayer on chain:", chainKey);
        console.log("Factory address:", factoryAddress);
        console.log("Relayer address:", relayerAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        UniteEscrowFactory factory = UniteEscrowFactory(factoryAddress);
        
        // Check if already authorized
        if (factory.authorizedRelayers(relayerAddress)) {
            console.log("Relayer already authorized");
        } else {
            factory.authorizeRelayer(relayerAddress);
            console.log("Relayer authorized successfully");
        }
        
        vm.stopBroadcast();
    }
    
    function getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "sepolia";
        if (chainId == 84532) return "baseSepolia";
        if (chainId == 421614) return "arbitrumSepolia";
        if (chainId == 128123) return "etherlinkTestnet";
        if (chainId == 10143) return "monadTestnet";
        revert("Unknown chain ID");
    }
}