// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import "forge-std/StdJson.sol";

contract FundTestUser is Script {
    using stdJson for string;

    // Amount to fund test user
    uint256 constant USDT_AMOUNT = 10000 * 10**6;  // 10,000 USDT
    uint256 constant DAI_AMOUNT = 10000 * 10**18;  // 10,000 DAI

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // Get test user address from private key
        uint256 testUserPrivateKey = vm.envUint("TEST_USER_PRIVATE_KEY");
        address testUser = vm.addr(testUserPrivateKey);
        
        // Read deployments
        string memory json = vm.readFile("deployments.json");
        string memory chainKey = getChainKey(block.chainid);
        
        // Get token addresses
        address usdtAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockUSDT"));
        address daiAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockDAI"));
        
        console.log("Funding test user on chain:", block.chainid);
        console.log("Test user:", testUser);
        console.log("USDT:", usdtAddress);
        console.log("DAI:", daiAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDT usdt = MockUSDT(usdtAddress);
        MockDAI dai = MockDAI(daiAddress);
        
        // Mint USDT to test user
        usdt.mint(testUser, USDT_AMOUNT);
        console.log("Minted", USDT_AMOUNT / 10**6, "USDT to test user");
        
        // Mint DAI to test user
        dai.mint(testUser, DAI_AMOUNT);
        console.log("Minted", DAI_AMOUNT / 10**18, "DAI to test user");
        
        vm.stopBroadcast();
        
        console.log("\nTest user funded successfully!");
    }
    
    function getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arb_sepolia";
        if (chainId == 10143) return "monad_testnet";
        revert("Unknown chain ID");
    }
}