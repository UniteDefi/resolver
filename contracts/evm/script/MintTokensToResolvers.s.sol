// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";
import "forge-std/StdJson.sol";

contract MintTokensToResolvers is Script {
    using stdJson for string;
    
    // Token amounts to mint
    uint256 constant USDT_AMOUNT = 10000 * 10**6;    // 10,000 USDT (6 decimals)
    uint256 constant DAI_AMOUNT = 10000 * 10**18;    // 10,000 DAI (18 decimals)
    uint256 constant WRAPPED_AMOUNT = 100 * 10**18;  // 100 wrapped native tokens
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        
        // Read resolver wallets from environment
        address[4] memory resolverWallets = [
            vm.envAddress("RESOLVER_WALLET_0"),
            vm.envAddress("RESOLVER_WALLET_1"),
            vm.envAddress("RESOLVER_WALLET_2"),
            vm.envAddress("RESOLVER_WALLET_3")
        ];
        
        // Read deployments
        string memory json = vm.readFile("../all_deployments.json");
        string memory chainIdStr = vm.toString(block.chainid);
        
        // Get token addresses for current chain
        address usdtAddress = json.readAddress(string.concat(".", chainIdStr, ".MockERC20"));
        address daiAddress = json.readAddress(string.concat(".", chainIdStr, ".MockERC20_2"));
        address wrappedNativeAddress = json.readAddress(string.concat(".", chainIdStr, ".MockWrappedNative"));
        
        console.log("Minting tokens to resolver wallets on chain:", block.chainid);
        console.log("USDT:", usdtAddress);
        console.log("DAI:", daiAddress);
        console.log("Wrapped Native:", wrappedNativeAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Get token contracts
        MockERC20 usdt = MockERC20(usdtAddress);
        MockERC20 dai = MockERC20(daiAddress);
        MockERC20 wrappedNative = MockERC20(wrappedNativeAddress);
        
        // Mint tokens to each resolver
        for (uint i = 0; i < 4; i++) {
            address resolver = resolverWallets[i];
            console.log("\nMinting to Resolver", i, ":", resolver);
            
            // Mint USDT
            usdt.mint(resolver, USDT_AMOUNT);
            console.log("  Minted", USDT_AMOUNT / 10**6, "USDT");
            
            // Mint DAI
            dai.mint(resolver, DAI_AMOUNT);
            console.log("  Minted", DAI_AMOUNT / 10**18, "DAI");
            
            // Mint Wrapped Native
            wrappedNative.mint(resolver, WRAPPED_AMOUNT);
            console.log("  Minted", WRAPPED_AMOUNT / 10**18, "Wrapped Native");
        }
        
        vm.stopBroadcast();
        
        console.log("\nToken minting completed successfully!");
        console.log("Note: Native gas tokens must be funded separately");
    }
}