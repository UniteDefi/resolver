// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";

contract FundWalletsSimple is Script {
    uint256 constant USDT_AMOUNT = 10000 * 10**6;   // 10,000 USDT per wallet
    uint256 constant DAI_AMOUNT = 10000 * 10**18;   // 10,000 DAI per wallet
    uint256 constant WRAPPED_AMOUNT = 100 * 10**18; // 100 Wrapped ETH per wallet

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        uint256 testUserPrivateKey = vm.envUint("TEST_USER_PRIVATE_KEY");
        address testUser = vm.addr(testUserPrivateKey);
        
        address usdtAddress;
        address daiAddress;
        address payable wrappedNativeAddress;
        address[4] memory resolvers;
        
        if (block.chainid == 84532) {
            // Base Sepolia (FINAL ADDRESSES)
            usdtAddress = 0x67A81aD76E3ea4b16C2300a656fAa818Abf1E3f4;
            daiAddress = 0x9367E83583c27Cbaf9A876f06D25Fb55d522BF5d;
            wrappedNativeAddress = payable(0x59f8aA85C76AE342316CEDCf2212b1106f17d932);
            resolvers = [
                0x1a2C6A4D526357f79165F5e14E5A5421bAB39bc3,
                0xF7b718f599777a438a4aa289e59671Fe270a10f3,
                0xA6757D98fF4C64164059A0d8cFfb3Ba87E0D109F,
                0xeba98E990bBE9616cA27d5a090143C1F18073c83
            ];
        } else if (block.chainid == 421614) {
            // Arbitrum Sepolia (FINAL ADDRESSES)
            usdtAddress = 0xbbB69a2263A64348afFabd786df31e1FA14068F4;
            daiAddress = 0xea861151F38cF9d788ed450F4096F7442ABfea63;
            wrappedNativeAddress = payable(0x82e94A2FF3BA70F5F328558bB83AB858819dda84);
            resolvers = [
                0xCe01A110B181a9bEeC00Ac94A00Bf27A84a3A3e3,
                0xa704Fdb433334A91B9B70Ccc1e0A18bCa3771d82,
                0xE433D54F8d64F15E0efB6520407c107EDd7f7FA7,
                0x952C0162981920a2C7A68fBA63c51889Db0C7148
            ];
        } else {
            revert("Unsupported chain");
        }
        
        console.log("\n=====================================================");
        console.log("Funding all wallets on chain", block.chainid);
        console.log("=====================================================\n");
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDT usdt = MockUSDT(usdtAddress);
        MockDAI dai = MockDAI(daiAddress);
        MockWrappedNative wrappedNative = MockWrappedNative(wrappedNativeAddress);
        
        // Fund resolvers
        console.log("1. Funding Resolver wallets...");
        string[4] memory names = ["Resolver_A", "Resolver_B", "Resolver_C", "Resolver_D"];
        
        for (uint i = 0; i < 4; i++) {
            address resolver = resolvers[i];
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
}