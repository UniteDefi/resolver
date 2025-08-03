// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IMintableERC20 is IERC20 {
    function mint(address to, uint256 amount) external;
}

contract MintTokens is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // Resolver wallets (use existing ones)
        address resolver0 = vm.envAddress("RESOLVER_WALLET_0");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        
        // Get token addresses for current chain
        (address mockUSDT, address mockDAI, address mockWrappedNative) = getTokenAddresses();
        
        console.log("Minting tokens on chain ID:", block.chainid);
        console.log("MockUSDT:", mockUSDT);
        console.log("MockDAI:", mockDAI);
        console.log("MockWrappedNative:", mockWrappedNative);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Mint USDT: 50,000 to each resolver
        if (mockUSDT != address(0)) {
            IMintableERC20(mockUSDT).mint(resolver0, 50_000 * 10**18);
            IMintableERC20(mockUSDT).mint(resolver1, 50_000 * 10**18);
            console.log("USDT minted");
        }
        
        // Mint DAI: 50,000 to each resolver
        if (mockDAI != address(0)) {
            IMintableERC20(mockDAI).mint(resolver0, 50_000 * 10**18);
            IMintableERC20(mockDAI).mint(resolver1, 50_000 * 10**18);
            console.log("DAI minted");
        }
        
        // Mint Wrapped Native: 5 to each resolver
        if (mockWrappedNative != address(0)) {
            IMintableERC20(mockWrappedNative).mint(resolver0, 5 * 10**18);
            IMintableERC20(mockWrappedNative).mint(resolver1, 5 * 10**18);
            console.log("Wrapped Native minted");
        }
        
        vm.stopBroadcast();
        
        console.log("\nToken minting complete!");
        console.log("Resolvers received: 50k USDT, 50k DAI, 5 Wrapped Native each");
    }
    
    function getTokenAddresses() internal view returns (address usdt, address dai, address wrappedNative) {
        uint256 chainId = block.chainid;
        
        // Base Sepolia
        if (chainId == 84532) {
            return (
                0x725437B77BEFb4418Dd91B91E6d736a52Cf8fd9A,
                0x4B16066062aC208ED722DE1A043A6d14857f26f2,
                0x159F8080B5BAEA5B681675cEC2f7fbC58D7ef734
            );
        }
        
        // Arbitrum Sepolia
        if (chainId == 421614) {
            return (
                0xffaD6Ca8c4060FE34F5848cf338c8cC681941278,
                0xA1bde0809362E4faC16a0f7E0C654aACCa956807,
                0x75784eC4AE2826FFF0ecC6C7bEc9971EBf607Ad7
            );
        }
        
        // Ethereum Sepolia
        if (chainId == 11155111) {
            return (
                0x0813210DE316379FaEc640AB2bab918385e2b269,
                0xf3BABa977445A991B0017f57C84b8922Bce4494E,
                0xA54a2868D24D3D370E3cDF320471705c26C4432C
            );
        }
        
        // Add more chains as needed
        revert("Chain not configured for token minting");
    }
}