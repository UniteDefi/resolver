// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import "forge-std/StdJson.sol";

contract UpdateDeployments is Script {
    using stdJson for string;
    
    struct ChainDeployment {
        uint256 chainId;
        string chainName;
        address wrappedNative;
        string wrappedNativeName;
        address usdt;
        address dai;
        address limitOrderProtocol;
        address uniteEscrowFactory;
        address[4] resolvers;
        address deployer;
        string rpcUrl;
    }
    
    function run() external {
        string memory json = vm.readFile("deployments.json");
        string memory output = "{\n";
        
        // Add deployment for current chain
        ChainDeployment memory deployment = getDeploymentFromBroadcast();
        
        // Update the specific chain in deployments.json
        string memory chainKey = getChainKey(block.chainid);
        
        output = string.concat(output, '  "', chainKey, '": {\n');
        output = string.concat(output, '    "chainId": ', vm.toString(deployment.chainId), ',\n');
        output = string.concat(output, '    "chainName": "', deployment.chainName, '",\n');
        output = string.concat(output, '    "deploymentDate": "', vm.toString(block.timestamp), '",\n');
        output = string.concat(output, '    "contracts": {\n');
        output = string.concat(output, '      "wrappedNative": {\n');
        output = string.concat(output, '        "name": "', deployment.wrappedNativeName, '",\n');
        output = string.concat(output, '        "address": "', vm.toString(deployment.wrappedNative), '"\n');
        output = string.concat(output, '      },\n');
        output = string.concat(output, '      "usdt": {\n');
        output = string.concat(output, '        "name": "Mock USDT",\n');
        output = string.concat(output, '        "address": "', vm.toString(deployment.usdt), '"\n');
        output = string.concat(output, '      },\n');
        output = string.concat(output, '      "dai": {\n');
        output = string.concat(output, '        "name": "Mock DAI",\n');
        output = string.concat(output, '        "address": "', vm.toString(deployment.dai), '"\n');
        output = string.concat(output, '      },\n');
        output = string.concat(output, '      "limitOrderProtocol": {\n');
        output = string.concat(output, '        "address": "', vm.toString(deployment.limitOrderProtocol), '"\n');
        output = string.concat(output, '      },\n');
        output = string.concat(output, '      "uniteEscrowFactory": {\n');
        output = string.concat(output, '        "address": "', vm.toString(deployment.uniteEscrowFactory), '"\n');
        output = string.concat(output, '      },\n');
        output = string.concat(output, '      "resolvers": [\n');
        
        for (uint i = 0; i < 4; i++) {
            output = string.concat(output, '        "', vm.toString(deployment.resolvers[i]), '"');
            if (i < 3) output = string.concat(output, ',');
            output = string.concat(output, '\n');
        }
        
        output = string.concat(output, '      ]\n');
        output = string.concat(output, '    },\n');
        output = string.concat(output, '    "deployer": "', vm.toString(deployment.deployer), '",\n');
        output = string.concat(output, '    "rpcUrl": "', deployment.rpcUrl, '"\n');
        output = string.concat(output, '  }\n');
        output = string.concat(output, '}');
        
        // Write to file
        vm.writeFile("deployments_new.json", output);
        console.log("Deployment info written to deployments_new.json");
        console.log("Please manually merge with existing deployments.json");
    }
    
    function getDeploymentFromBroadcast() internal view returns (ChainDeployment memory) {
        // This would parse the broadcast data from the most recent deployment
        // For now, returning placeholder
        ChainDeployment memory deployment;
        deployment.chainId = block.chainid;
        deployment.chainName = getChainName(block.chainid);
        deployment.deployer = msg.sender;
        deployment.rpcUrl = getRpcUrl(block.chainid);
        return deployment;
    }
    
    function getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "sepolia";
        if (chainId == 84532) return "baseSepolia";
        if (chainId == 421614) return "arbitrumSepolia";
        if (chainId == 128123) return "etherlinkTestnet";
        if (chainId == 10143) return "monadTestnet";
        revert("Unknown chain ID");
    }
    
    function getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "Sepolia";
        if (chainId == 84532) return "Base Sepolia";
        if (chainId == 421614) return "Arbitrum Sepolia";
        if (chainId == 128123) return "Etherlink Testnet";
        if (chainId == 10143) return "Monad Testnet";
        return "Unknown";
    }
    
    function getRpcUrl(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY";
        if (chainId == 84532) return "https://sepolia.base.org";
        if (chainId == 421614) return "https://arb-sepolia.g.alchemy.com/v2/YOUR_KEY";
        if (chainId == 128123) return "https://rpc.ankr.com/etherlink_testnet";
        if (chainId == 10143) return "https://testnet-rpc.monad.xyz";
        return "";
    }
}