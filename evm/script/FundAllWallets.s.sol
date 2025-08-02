// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";
import "forge-std/StdJson.sol";

contract FundAllWallets is Script {
    using stdJson for string;

    uint256 constant USDT_AMOUNT = 10000 * 10**6;   // 10,000 USDT per wallet
    uint256 constant DAI_AMOUNT = 10000 * 10**18;   // 10,000 DAI per wallet
    uint256 constant WRAPPED_AMOUNT = 100 * 10**18; // 100 Wrapped ETH per wallet

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 testUserPrivateKey = vm.envUint("TEST_USER_PRIVATE_KEY");
        address testUser = vm.addr(testUserPrivateKey);
        
        // Read deployments
        string memory json = vm.readFile("deployments_main.json");
        string memory chainKey = getChainKey(block.chainid);
        
        // Get contract addresses
        address usdtAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockUSDT"));
        address daiAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockDAI"));
        address payable wrappedNativeAddress = payable(json.readAddress(string.concat(".evm.", chainKey, ".MockWrappedNative")));
        
        // Get resolver addresses
        address[4] memory resolvers = [
            json.readAddress(string.concat(".evm.", chainKey, ".Resolver_A")),
            json.readAddress(string.concat(".evm.", chainKey, ".Resolver_B")),
            json.readAddress(string.concat(".evm.", chainKey, ".Resolver_C")),
            json.readAddress(string.concat(".evm.", chainKey, ".Resolver_D"))
        ];
        
        console.log("\n=====================================================");
        console.log("Funding all wallets on", chainKey);
        console.log("=====================================================\n");
        
        console.log("Contracts:");
        console.log("- USDT:", usdtAddress);
        console.log("- DAI:", daiAddress);
        console.log("- Wrapped Native:", wrappedNativeAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDT usdt = MockUSDT(usdtAddress);
        MockDAI dai = MockDAI(daiAddress);
        MockWrappedNative wrappedNative = MockWrappedNative(wrappedNativeAddress);
        
        // Fund resolvers
        console.log("\n1. Funding Resolver wallets...");
        for (uint i = 0; i < 4; i++) {
            address resolver = resolvers[i];
            string[4] memory names = ["Resolver_A", "Resolver_B", "Resolver_C", "Resolver_D"];
            
            console.log("\n  Funding", names[i], ":", resolver);
            
            // Mint USDT
            usdt.mint(resolver, USDT_AMOUNT);
            console.log("    Minted", USDT_AMOUNT / 10**6, "USDT");
            
            // Mint DAI
            dai.mint(resolver, DAI_AMOUNT);
            console.log("    Minted", DAI_AMOUNT / 10**18, "DAI");
            
            // Mint Wrapped Native
            wrappedNative.mint(resolver, WRAPPED_AMOUNT);
            console.log("    Minted", WRAPPED_AMOUNT / 10**18, "Wrapped ETH");
        }
        
        // Fund test user
        console.log("\n2. Funding test user wallet...");
        console.log("  Test user:", testUser);
        
        // Mint USDT
        usdt.mint(testUser, USDT_AMOUNT);
        console.log("    Minted", USDT_AMOUNT / 10**6, "USDT");
        
        // Mint DAI
        dai.mint(testUser, DAI_AMOUNT);
        console.log("    Minted", DAI_AMOUNT / 10**18, "DAI");
        
        // Mint Wrapped Native
        wrappedNative.mint(testUser, WRAPPED_AMOUNT);
        console.log("    Minted", WRAPPED_AMOUNT / 10**18, "Wrapped ETH");
        
        vm.stopBroadcast();
        
        console.log("\n=====================================================");
        console.log("FUNDING COMPLETE!");
        console.log("=====================================================");
    }
    
    function getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arb_sepolia";
        if (chainId == 10143) return "monad_testnet";
        revert("Unknown chain ID");
    }
}