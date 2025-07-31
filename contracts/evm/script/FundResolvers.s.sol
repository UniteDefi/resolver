// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import "forge-std/StdJson.sol";

contract FundResolvers is Script {
    using stdJson for string;

    // Amount to fund each resolver
    uint256 constant USDT_AMOUNT = 10000 * 10**6;  // 10,000 USDT
    uint256 constant DAI_AMOUNT = 10000 * 10**18;  // 10,000 DAI

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // Read deployments
        string memory json = vm.readFile("deployments.json");
        string memory chainKey = getChainKey(block.chainid);
        
        // Get token addresses
        address usdtAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockUSDT"));
        address daiAddress = json.readAddress(string.concat(".evm.", chainKey, ".MockDAI"));
        
        // Get resolver addresses - prioritize SimpleResolver if available
        address[4] memory resolvers;
        
        // Try to read SimpleResolver first, fallback to Resolver
        try vm.parseJsonAddress(json, string.concat(".evm.", chainKey, ".SimpleResolver")) returns (address addr) {
            resolvers[0] = addr;
        } catch {
            resolvers[0] = json.readAddress(string.concat(".evm.", chainKey, ".Resolver"));
        }
        
        try vm.parseJsonAddress(json, string.concat(".evm.", chainKey, ".SimpleResolver_2")) returns (address addr) {
            resolvers[1] = addr;
        } catch {
            resolvers[1] = json.readAddress(string.concat(".evm.", chainKey, ".Resolver_2"));
        }
        
        try vm.parseJsonAddress(json, string.concat(".evm.", chainKey, ".SimpleResolver_3")) returns (address addr) {
            resolvers[2] = addr;
        } catch {
            resolvers[2] = json.readAddress(string.concat(".evm.", chainKey, ".Resolver_3"));
        }
        
        try vm.parseJsonAddress(json, string.concat(".evm.", chainKey, ".SimpleResolver_4")) returns (address addr) {
            resolvers[3] = addr;
        } catch {
            resolvers[3] = json.readAddress(string.concat(".evm.", chainKey, ".Resolver_4"));
        }
        
        console.log("Funding resolvers on chain:", block.chainid);
        console.log("USDT:", usdtAddress);
        console.log("DAI:", daiAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDT usdt = MockUSDT(usdtAddress);
        MockDAI dai = MockDAI(daiAddress);
        
        // Fund each resolver
        for (uint i = 0; i < 4; i++) {
            address resolver = resolvers[i];
            console.log("\nFunding Resolver", i, ":", resolver);
            
            // Mint USDT to resolver
            usdt.mint(resolver, USDT_AMOUNT);
            console.log("  Minted", USDT_AMOUNT / 10**6, "USDT");
            
            // Mint DAI to resolver
            dai.mint(resolver, DAI_AMOUNT);
            console.log("  Minted", DAI_AMOUNT / 10**18, "DAI");
        }
        
        vm.stopBroadcast();
        
        console.log("\nResolver funding complete!");
    }
    
    function getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arb_sepolia";
        if (chainId == 10143) return "monad_testnet";
        revert("Unknown chain ID");
    }
}