// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {DeployTokens} from "./DeployTokens.s.sol";
import {DeployLimitOrderProtocol} from "./DeployLimitOrderProtocol.s.sol";
import {DeployUniteEscrowFactory} from "./DeployUniteEscrowFactory.s.sol";
import {DeployResolvers} from "./DeployResolvers.s.sol";
import {ChainConfig} from "./ChainConfig.sol";

contract DeployAll is Script {
    // Access token address - same on all chains (1inch token)
    address constant ACCESS_TOKEN = 0xACCe550000159e70908C0499a1119D04e7039C28;
    
    struct Deployment {
        uint256 chainId;
        string chainName;
        address wrappedNative;
        address usdt;
        address dai;
        address limitOrderProtocol;
        address escrowFactory;
        address[4] resolvers;
    }
    
    function run() external {
        ChainConfig config = new ChainConfig();
        ChainConfig.ChainInfo memory chainInfo = config.getChainInfo(block.chainid);
        
        console.log("\n========================================");
        console.log("Deploying all contracts on", chainInfo.name);
        console.log("Chain ID:", block.chainid);
        console.log("========================================\n");
        
        // Deploy tokens
        DeployTokens tokenDeployer = new DeployTokens();
        DeployTokens.TokenDeployment memory tokens = tokenDeployer.run();
        
        // Deploy LimitOrderProtocol
        DeployLimitOrderProtocol lopDeployer = new DeployLimitOrderProtocol();
        address lop = lopDeployer.run(tokens.wrappedNative);
        
        // Deploy UniteEscrowFactory
        DeployUniteEscrowFactory factoryDeployer = new DeployUniteEscrowFactory();
        address escrowFactory = factoryDeployer.run(lop, tokens.dai, ACCESS_TOKEN);
        
        // Deploy 4 Resolver contracts
        DeployResolvers resolverDeployer = new DeployResolvers();
        address[4] memory resolvers = resolverDeployer.run(escrowFactory, lop);
        
        // Create deployment struct
        Deployment memory deployment = Deployment({
            chainId: block.chainid,
            chainName: chainInfo.name,
            wrappedNative: tokens.wrappedNative,
            usdt: tokens.usdt,
            dai: tokens.dai,
            limitOrderProtocol: lop,
            escrowFactory: escrowFactory,
            resolvers: resolvers
        });
        
        // Log deployment summary
        console.log("\n========================================");
        console.log("DEPLOYMENT SUMMARY");
        console.log("========================================");
        console.log("Chain:", deployment.chainName);
        console.log("Chain ID:", deployment.chainId);
        console.log("Wrapped Native:", deployment.wrappedNative);
        console.log("USDT:", deployment.usdt);
        console.log("DAI:", deployment.dai);
        console.log("LimitOrderProtocol:", deployment.limitOrderProtocol);
        console.log("UniteEscrowFactory:", deployment.escrowFactory);
        console.log("\nResolver Contracts:");
        for (uint i = 0; i < 4; i++) {
            console.log("  Resolver", i + 1, ":", deployment.resolvers[i]);
        }
        console.log("========================================\n");
    }
}