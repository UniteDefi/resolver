// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/interfaces/IOrderMixin.sol";
import "../src/interfaces/IBaseEscrow.sol";
import "../src/UniteResolver.sol";
import "../src/UniteLimitOrderProtocol.sol";
import "../src/libraries/DutchAuctionLib.sol";

contract TestFillOrder is Script {
    
    function run() external {
        // Load environment variables
        address resolver0 = vm.envAddress("RESOLVER_WALLET_0");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        
        console.log("=== Testing fillOrder Functionality ===");
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
        
        // Test fillOrder functionality
        testFillOrderFlow(resolver1, mockUSDT, resolverAddress, limitOrderProtocol);
        
        console.log("\n=== fillOrder Test Complete ===");
    }
    
    function testFillOrderFlow(
        address resolver,
        address token,
        address resolverContract,
        address limitOrderProtocol
    ) internal {
        console.log("\n--- Testing fillOrder Flow ---");
        
        uint256 resolverPrivateKey = vm.envUint("RESOLVER_PRIVATE_KEY_1");
        
        // Create a test order
        IOrderMixin.Order memory order = IOrderMixin.Order({
            salt: uint256(keccak256(abi.encode(block.timestamp, resolver))),
            maker: resolver, // Resolver acts as maker for this test
            receiver: address(0), // Send to maker
            makerAsset: token,
            takerAsset: token, // Same token for simplicity
            makingAmount: 1000e6, // 1000 USDT
            takingAmount: 1000e6, // Initial taking amount (will be calculated by Dutch auction)
            deadline: block.timestamp + 7200, // 2 hours deadline
            nonce: 0,
            srcChainId: block.chainid,
            dstChainId: block.chainid == 84532 ? 421614 : 84532, // Cross-chain
            auctionStartTime: block.timestamp,
            auctionEndTime: block.timestamp + 3600, // 1 hour auction
            startPrice: 1e18, // 1:1 start price
            endPrice: 0.9e18 // 0.9:1 end price (10% discount)
        });
        
        // Create test immutables
        IBaseEscrow.Immutables memory immutables = IBaseEscrow.Immutables({
            orderHash: keccak256(abi.encode(order)),
            hashlock: keccak256(abi.encode("test-secret")),
            maker: uint160(order.maker),
            taker: uint160(resolver),
            token: uint160(token),
            amount: 500e6, // Partial amount resolver wants to fill
            safetyDeposit: 50e6, // 50 USDT safety deposit
            timelocks: 0 // Will be set by resolver
        });
        
        vm.startBroadcast(resolverPrivateKey);
        
        console.log("Testing fillOrder with 500 USDT...");
        
        // Check balances before
        uint256 balanceBefore = IERC20(token).balanceOf(resolver);
        console.log("Resolver balance before:", balanceBefore / 1e6, "USDT");
        
        // Calculate expected destination amount at current time
        uint256 expectedDestAmount = DutchAuctionLib.calculateTakingAmount(
            500e6, // 500 USDT src amount
            order.startPrice,
            order.endPrice,
            order.auctionStartTime,
            order.auctionEndTime,
            block.timestamp
        );
        console.log("Expected dest amount at current price:", expectedDestAmount / 1e6, "USDT");
        
        // Check if resolver has enough tokens
        if (balanceBefore < expectedDestAmount + 50e6) { // +50 for safety deposit
            console.log("Warning: Insufficient balance for test");
            vm.stopBroadcast();
            return;
        }
        
        // Approve tokens to resolver contract (if not already done)
        uint256 currentAllowance = IERC20(token).allowance(resolver, resolverContract);
        if (currentAllowance < expectedDestAmount) {
            IERC20(token).approve(resolverContract, 1000000e6);
            console.log("Approved additional tokens to resolver contract");
        }
        
        try UniteResolver(payable(resolverContract)).fillOrder{value: 0.01 ether}(
            immutables,
            order,
            block.timestamp + 3600, // srcCancellationTimestamp
            500e6 // srcAmount - resolver wants to fill 500 USDT
        ) {
            console.log("SUCCESS: fillOrder executed successfully!");
            
            // Check balance after
            uint256 balanceAfter = IERC20(token).balanceOf(resolver);
            uint256 tokensUsed = balanceBefore - balanceAfter;
            console.log("Tokens used:", tokensUsed / 1e6, "USDT");
            console.log("Resolver balance after:", balanceAfter / 1e6, "USDT");
            
        } catch Error(string memory reason) {
            console.log("ERROR: fillOrder failed:", reason);
        } catch (bytes memory lowLevelData) {
            console.log("ERROR: fillOrder failed with low-level error");
            console.logBytes(lowLevelData);
        }
        
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