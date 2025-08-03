// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/mocks/MockUSDT.sol";
import "../src/mocks/MockDAI.sol";

contract MintForAll is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // User and resolver addresses
        address user = vm.envAddress("USER_WALLET");
        address resolver0 = vm.envAddress("RESOLVER_WALLET_0");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        address resolver2 = vm.envAddress("RESOLVER_WALLET_2");
        address resolver3 = vm.envAddress("RESOLVER_WALLET_3");
        
        // Get deployed token addresses
        (address usdtAddr, address daiAddr) = getTokenAddresses();
        
        console.log("\n=== MINTING TOKENS ===");
        console.log("Chain ID:", block.chainid);
        console.log("USDT:", usdtAddr);
        console.log("DAI:", daiAddr);
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDT usdt = MockUSDT(usdtAddr);
        MockDAI dai = MockDAI(daiAddr);
        
        uint256 amount = 1000 * 10**18; // 1000 tokens with 18 decimals
        
        // Mint USDT
        usdt.mint(user, amount);
        usdt.mint(resolver0, amount);
        usdt.mint(resolver1, amount);
        usdt.mint(resolver2, amount);
        usdt.mint(resolver3, amount);
        console.log("Minted 1000 USDT to all addresses");
        
        // Mint DAI
        dai.mint(user, amount);
        dai.mint(resolver0, amount);
        dai.mint(resolver1, amount);
        dai.mint(resolver2, amount);
        dai.mint(resolver3, amount);
        console.log("Minted 1000 DAI to all addresses");
        
        vm.stopBroadcast();
        
        console.log("\n✅ Minting complete!");
    }
    
    function getTokenAddresses() internal view returns (address usdt, address dai) {
        uint256 chainId = block.chainid;
        
        if (chainId == 84532) { // Base Sepolia
            return (
                address(0), // Will be filled after deployment
                address(0)  // Will be filled after deployment
            );
        } else if (chainId == 421614) { // Arbitrum Sepolia
            return (
                address(0), // Will be filled after deployment
                address(0)  // Will be filled after deployment
            );
        } else {
            revert("Unsupported chain");
        }
    }
}