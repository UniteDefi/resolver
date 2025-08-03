// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/interfaces/IOrderMixin.sol";
import "../src/UniteResolver.sol";
import "../src/UniteLimitOrderProtocol.sol";
import "../src/libraries/DutchAuctionLib.sol";

contract TestDutchAuction is Script {
    
    function run() external {
        // Load environment variables - use resolver wallets that exist
        address resolver0 = vm.envAddress("RESOLVER_WALLET_0");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        
        console.log("=== Dutch Auction Test ===");
        console.log("Resolver0:", resolver0);
        console.log("Resolver1:", resolver1);
        console.log("Chain ID:", block.chainid);
        
        // Get contract addresses
        (address limitOrderProtocol, address escrowFactory, address mockUSDT, address resolverAddress) = getContractAddresses();
        
        console.log("\nContract addresses:");
        console.log("LimitOrderProtocol:", limitOrderProtocol);
        console.log("EscrowFactory:", escrowFactory);
        console.log("MockUSDT:", mockUSDT);
        console.log("ResolverContract:", resolverAddress);
        
        // Test Dutch auction price calculation
        testPriceCalculation();
        
        // Test resolver approval
        testResolverApproval(resolver1, mockUSDT, resolverAddress);
        
        console.log("\n=== Dutch Auction Test Complete ===");
    }
    
    function testPriceCalculation() internal {
        console.log("\n--- Testing Dutch Auction Price Calculation ---");
        
        uint256 startPrice = 1e18; // 100%
        uint256 endPrice = 0.9e18;  // 90%
        uint256 auctionStart = block.timestamp;
        uint256 auctionEnd = block.timestamp + 3600; // 1 hour
        
        // Test current price at start
        uint256 currentPrice = DutchAuctionLib.getCurrentPrice(
            startPrice, endPrice, auctionStart, auctionEnd, block.timestamp
        );
        console.log("Current price at start:", currentPrice * 100 / 1e18, "%");
        
        // Test price after 30 minutes
        uint256 futurePrice = DutchAuctionLib.getCurrentPrice(
            startPrice, endPrice, auctionStart, auctionEnd, block.timestamp + 1800
        );
        console.log("Price after 30 minutes:", futurePrice * 100 / 1e18, "%");
        
        // Test taking amount calculation
        uint256 makingAmount = 1000e6; // 1000 USDT
        uint256 takingAmount = DutchAuctionLib.calculateTakingAmount(
            makingAmount, startPrice, endPrice, auctionStart, auctionEnd, block.timestamp
        );
        console.log("For 1000 USDT making, taking amount:", takingAmount / 1e6, "USDT");
    }
    
    function testResolverApproval(address resolver, address token, address resolverContract) internal {
        console.log("\n--- Testing Resolver Token Approval ---");
        
        uint256 resolverPrivateKey = vm.envUint("RESOLVER_PRIVATE_KEY_1");
        
        // Check current balance
        uint256 balance = IERC20(token).balanceOf(resolver);
        console.log("Resolver token balance:", balance / 1e6, "USDT");
        
        if (balance < 1000e6) {
            console.log("Warning: Resolver has insufficient tokens for testing");
            console.log("Please run mint script first");
            return;
        }
        
        vm.startBroadcast(resolverPrivateKey);
        
        // Approve tokens to resolver contract
        IERC20(token).approve(resolverContract, 1000000e6); // Approve 1M USDT
        console.log("Approved 1,000,000 USDT to resolver contract");
        
        // Check allowance
        uint256 allowance = IERC20(token).allowance(resolver, resolverContract);
        console.log("Current allowance:", allowance / 1e6, "USDT");
        
        vm.stopBroadcast();
    }
    
    function getContractAddresses() internal view returns (address limitOrder, address escrowFactory, address usdt, address resolver) {
        uint256 chainId = block.chainid;
        
        // Base Sepolia
        if (chainId == 84532) {
            return (
                0x248e11FDC7DFA937EF3907EE03b2AC3f67B462E1, // limitOrder
                0xa4C5c618158622Dbac8cfd156eFa3007449AE888, // escrowFactory
                0x97a2d8Dfece96252518a4327aFFf40B61A0a025A, // usdt
                0xA06b8dC21e4585098E029e7475785C8FdE507066  // resolver0
            );
        }
        
        // Arbitrum Sepolia
        if (chainId == 421614) {
            return (
                0x65A3f6a45535E6BB0F75415EA4705B761dE1fCFd, // limitOrder
                0xE2bb2a6728224F922ce3bD3c20396b79A564CD6E, // escrowFactory
                0x84159eadE815141727FeE309fDdaaf7BCF36cFF9, // usdt
                0xe7A7d774cDdcA1dFAB4f24Bbf62323Eaca942898  // resolver0
            );
        }
        
        revert("Chain not configured for testing");
    }
}