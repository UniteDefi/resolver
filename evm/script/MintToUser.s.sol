// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";
import "forge-std/StdJson.sol";

contract MintToUser is Script {
    using stdJson for string;
    
    // Default token amounts to mint
    uint256 constant USDT_AMOUNT = 10000 * 10**6;    // 10,000 USDT (6 decimals)
    uint256 constant DAI_AMOUNT = 10000 * 10**18;    // 10,000 DAI (18 decimals)
    uint256 constant WRAPPED_AMOUNT = 100 * 10**18;  // 100 wrapped native tokens
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // Get user wallet from TEST_USER_PRIVATE_KEY
        uint256 userPrivateKey = vm.envUint("TEST_USER_PRIVATE_KEY");
        address userWallet = vm.addr(userPrivateKey);
        
        // Read deployments
        string memory json = vm.readFile("deployments.json");
        string memory chainKey = getChainKey(block.chainid);
        
        // Get token addresses for current chain
        address usdtAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockUSDT"));
        address daiAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockDAI"));
        address payable wrappedNativeAddress = payable(json.readAddress(string.concat(".evm.", chainKey, ".MockWrappedNative")));
        
        console.log("Minting tokens to user wallet on chain:", block.chainid);
        console.log("User wallet:", userWallet);
        console.log("USDT:", usdtAddress);
        console.log("DAI:", daiAddress);
        console.log("Wrapped Native:", wrappedNativeAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Get token contracts
        MockUSDT usdt = MockUSDT(usdtAddress);
        MockDAI dai = MockDAI(daiAddress);
        MockWrappedNative wrappedNative = MockWrappedNative(wrappedNativeAddress);
        
        // Mint USDT
        usdt.mint(userWallet, USDT_AMOUNT);
        console.log("Minted", USDT_AMOUNT / 10**6, "USDT");
        
        // Mint DAI
        dai.mint(userWallet, DAI_AMOUNT);
        console.log("Minted", DAI_AMOUNT / 10**18, "DAI");
        
        // Skip wrapped native for now - would need ETH
        // wrappedNative.deposit{value: WRAPPED_AMOUNT}();
        // wrappedNative.transfer(userWallet, WRAPPED_AMOUNT);
        // console.log("Deposited and transferred", WRAPPED_AMOUNT / 10**18, "Wrapped Native");
        
        vm.stopBroadcast();
        
        console.log("\nUser wallet funded successfully!");
    }
    
    function getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arb_sepolia";
        if (chainId == 10143) return "monad_testnet";
        revert("Unknown chain ID");
    }
}