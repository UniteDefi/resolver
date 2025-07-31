// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";
import "forge-std/StdJson.sol";

contract MintTestTokens is Script {
    using stdJson for string;
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address testWallet = vm.envAddress("TEST_WALLET_ADDRESS");
        
        // Read deployments.json to get token addresses
        string memory json = vm.readFile("deployments.json");
        string memory chainKey = getChainKey(block.chainid);
        
        // Get token addresses
        address usdtAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockUSDT"));
        address daiAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockDAI"));
        address wrappedNativeAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockWrappedNative"));
        
        console.log("Minting test tokens on chain:", chainKey);
        console.log("Test wallet:", testWallet);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Mint USDT (6 decimals)
        MockUSDT usdt = MockUSDT(usdtAddress);
        usdt.mint(testWallet, 10000 * 10**6); // 10,000 USDT
        console.log("Minted 10,000 USDT");
        
        // Mint DAI (18 decimals)
        MockDAI dai = MockDAI(daiAddress);
        dai.mint(testWallet, 10000 * 10**18); // 10,000 DAI
        console.log("Minted 10,000 DAI");
        
        // Send native tokens for wrapped native
        if (address(this).balance >= 1 ether) {
            payable(testWallet).transfer(1 ether);
            console.log("Sent 1 native token for wrapping");
        }
        
        vm.stopBroadcast();
        
        console.log("\nTest tokens minted successfully!");
        console.log("Next: Approve UniteEscrowFactory to spend tokens");
    }
    
    function getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arb_sepolia";
        if (chainId == 128123) return "etherlink_testnet";
        if (chainId == 10143) return "monad_testnet";
        revert("Unknown chain ID");
    }
}