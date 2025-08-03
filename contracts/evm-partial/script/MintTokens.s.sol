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
        
        // User wallets
        address user1 = vm.envAddress("USER_WALLET_1");
        address user2 = vm.envAddress("USER_WALLET_2");
        
        // Resolver wallets
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        address resolver2 = vm.envAddress("RESOLVER_WALLET_2");
        address resolver3 = vm.envAddress("RESOLVER_WALLET_3");
        
        // Get token addresses for current chain
        (address mockUSDT, address mockDAI, address mockWrappedNative) = getTokenAddresses();
        
        console.log("Minting tokens on chain ID:", block.chainid);
        console.log("MockUSDT:", mockUSDT);
        console.log("MockDAI:", mockDAI);
        console.log("MockWrappedNative:", mockWrappedNative);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Mint USDT: 100,000 to each user, 50,000 to each resolver
        if (mockUSDT != address(0)) {
            IMintableERC20(mockUSDT).mint(user1, 100_000 * 10**6);
            IMintableERC20(mockUSDT).mint(user2, 100_000 * 10**6);
            IMintableERC20(mockUSDT).mint(resolver1, 50_000 * 10**6);
            IMintableERC20(mockUSDT).mint(resolver2, 50_000 * 10**6);
            IMintableERC20(mockUSDT).mint(resolver3, 50_000 * 10**6);
            console.log("✅ USDT minted");
        }
        
        // Mint DAI: 100,000 to each user, 50,000 to each resolver
        if (mockDAI != address(0)) {
            IMintableERC20(mockDAI).mint(user1, 100_000 * 10**18);
            IMintableERC20(mockDAI).mint(user2, 100_000 * 10**18);
            IMintableERC20(mockDAI).mint(resolver1, 50_000 * 10**18);
            IMintableERC20(mockDAI).mint(resolver2, 50_000 * 10**18);
            IMintableERC20(mockDAI).mint(resolver3, 50_000 * 10**18);
            console.log("✅ DAI minted");
        }
        
        // Mint Wrapped Native: 10 to each user, 5 to each resolver
        if (mockWrappedNative != address(0)) {
            IMintableERC20(mockWrappedNative).mint(user1, 10 * 10**18);
            IMintableERC20(mockWrappedNative).mint(user2, 10 * 10**18);
            IMintableERC20(mockWrappedNative).mint(resolver1, 5 * 10**18);
            IMintableERC20(mockWrappedNative).mint(resolver2, 5 * 10**18);
            IMintableERC20(mockWrappedNative).mint(resolver3, 5 * 10**18);
            console.log("✅ Wrapped Native minted");
        }
        
        vm.stopBroadcast();
        
        console.log("\n✅ Token minting complete!");
        console.log("Users received: 100k USDT, 100k DAI, 10 Wrapped Native each");
        console.log("Resolvers received: 50k USDT, 50k DAI, 5 Wrapped Native each");
    }
    
    function getTokenAddresses() internal view returns (address usdt, address dai, address wrappedNative) {
        uint256 chainId = block.chainid;
        
        // Base Sepolia
        if (chainId == 84532) {
            return (
                0x97a2d8Dfece96252518a4327aFFf40B61A0a025A,
                0x45A3AF79Ad654e75114988Abd92615eD79754eF5,
                0x67f4840a271fd6f130324F576312eCd806Cc9545
            );
        }
        
        // Arbitrum Sepolia
        if (chainId == 421614) {
            return (
                0x84159eadE815141727FeE309fDdaaf7BCF36cFF9,
                0x79899508A267fCC3E5F838a488b7eFA2D8f32659,
                0x630b2EBcA37EeE832c1c6982858ec552afc05605
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