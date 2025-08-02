// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import "./DeployMocks.s.sol";
import "./Deploy.s.sol";
import "./FundResolvers.s.sol";

contract DeployAllChains is Script {
    struct ChainDeployment {
        uint256 chainId;
        string chainName;
        address limitOrderProtocol;
        address escrowFactory;
        address resolver0;
        address resolver1;
        address mockUSDT;
        address mockDAI;
        address mockWrappedNative;
    }
    
    function run() external {
        uint256 chainId = block.chainid;
        string memory chainName = getChainName(chainId);
        
        console.log("\n========================================");
        console.log("Deploying on chain:", chainName);
        console.log("Chain ID:", chainId);
        console.log("========================================\n");
        
        // Deploy mock tokens
        DeployMocks mockDeployer = new DeployMocks();
        (address usdt, address dai, address wrappedNative) = mockDeployer.run();
        
        // Deploy main contracts
        Deploy mainDeployer = new Deploy();
        mainDeployer.run();
        
        // Fund resolvers
        FundResolvers funder = new FundResolvers();
        funder.run();
        
        console.log("\n========================================");
        console.log("DEPLOYMENT COMPLETE FOR", chainName);
        console.log("========================================\n");
    }
    
    function getChainName(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 128123) return "etherlink_testnet";
        if (chainId == 10143) return "monad_testnet";
        if (chainId == 2525) return "injective_testnet";
        if (chainId == 1313161555) return "aurora_testnet";
        if (chainId == 97) return "bnb_testnet";
        if (chainId == 11155420) return "op_sepolia";
        if (chainId == 80002) return "polygon_amoy";
        if (chainId == 534351) return "scroll_sepolia";
        if (chainId == 44787) return "celo_alfajores";
        if (chainId == 1301) return "unichain_sepolia";
        if (chainId == 545) return "flow_testnet";
        if (chainId == 713715) return "sei_testnet";
        return "unknown";
    }
}