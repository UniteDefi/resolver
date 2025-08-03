// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/interfaces/IOrderMixin.sol";
import "../src/interfaces/IBaseEscrow.sol";
import "../src/UniteResolver.sol";
import "../src/UniteLimitOrderProtocol.sol";
import "../src/libraries/DutchAuctionLib.sol";

contract TestOrderCompletion is Script {
    
    function run() external {
        // Load environment variables
        address resolver0 = vm.envAddress("RESOLVER_WALLET_0");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        
        console.log("=== Testing Order Completion Tracking ===");
        console.log("Resolver0:", resolver0);
        console.log("Resolver1:", resolver1);
        console.log("Chain ID:", block.chainid);
        
        // Get contract addresses
        (address limitOrderProtocol, address escrowFactory, address mockUSDT, address resolverAddress) = getContractAddresses();
        
        console.log("\nContract addresses:");
        console.log("LimitOrderProtocol:", limitOrderProtocol);
        console.log("ResolverContract:", resolverAddress);
        
        // Test order completion tracking
        testOrderCompletionFlow(resolver1, mockUSDT, resolverAddress, limitOrderProtocol);
        
        console.log("\n=== Order Completion Test Complete ===");
    }
    
    function testOrderCompletionFlow(
        address resolver,
        address token,
        address resolverContract,
        address limitOrderProtocol
    ) internal {
        console.log("\n--- Testing Order Completion Flow ---");
        
        uint256 resolverPrivateKey = vm.envUint("RESOLVER_PRIVATE_KEY_1");
        
        // Create a small test order that can be fully filled
        IOrderMixin.Order memory order = IOrderMixin.Order({
            salt: uint256(keccak256(abi.encode(block.timestamp, resolver, "completion-test"))),
            maker: resolver,
            receiver: address(0),
            makerAsset: token,
            takerAsset: token,
            makingAmount: 100e6, // Small 100 USDT order for easy completion
            takingAmount: 100e6,
            deadline: block.timestamp + 7200,
            nonce: 1, // Different nonce from previous test
            srcChainId: block.chainid,
            dstChainId: block.chainid == 84532 ? 421614 : 84532,
            auctionStartTime: block.timestamp,
            auctionEndTime: block.timestamp + 3600,
            startPrice: 1e18,
            endPrice: 0.9e18
        });
        
        UniteLimitOrderProtocol lop = UniteLimitOrderProtocol(limitOrderProtocol);
        
        // Convert to simple order format to get order hash
        bytes32 orderHash = keccak256(abi.encode(
            keccak256(
                "Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 deadline,uint256 nonce,uint256 srcChainId,uint256 dstChainId,uint256 auctionStartTime,uint256 auctionEndTime,uint256 startPrice,uint256 endPrice)"
            ),
            order.salt,
            order.maker,
            order.receiver,
            order.makerAsset,
            order.takerAsset,
            order.makingAmount,
            order.takingAmount,
            order.deadline,
            order.nonce,
            order.srcChainId,
            order.dstChainId,
            order.auctionStartTime,
            order.auctionEndTime,
            order.startPrice,
            order.endPrice
        ));
        
        console.log("Testing order completion with 100 USDT order");
        
        // Check initial state
        bool isFullyFilled = lop.isOrderFullyFilled(orderHash);
        console.log("Order initially fully filled:", isFullyFilled);
        
        vm.startBroadcast(resolverPrivateKey);
        
        // Fill 60% of the order first
        console.log("\n1. Filling 60 USDT (60% of order)...");
        
        IBaseEscrow.Immutables memory immutables1 = IBaseEscrow.Immutables({
            orderHash: keccak256(abi.encode(order, "fill1")),
            hashlock: keccak256(abi.encode("test-secret-1")),
            maker: uint160(order.maker),
            taker: uint160(resolver),
            token: uint160(token),
            amount: 60e6,
            safetyDeposit: 6e6,
            timelocks: 0
        });
        
        try UniteResolver(payable(resolverContract)).fillOrder{value: 0.01 ether}(
            immutables1,
            order,
            block.timestamp + 3600,
            60e6 // Fill 60 USDT
        ) {
            console.log("SUCCESS: First fill (60 USDT) completed");
        } catch Error(string memory reason) {
            console.log("ERROR: First fill failed:", reason);
        }
        
        // Check remaining amount
        uint256 remainingAmount = lop.getRemainingAmountByOrder(order);
        console.log("Remaining amount after first fill:", remainingAmount / 1e6, "USDT");
        
        // Fill the remaining 40% to complete the order
        console.log("\n2. Filling remaining 40 USDT (completing order)...");
        
        IBaseEscrow.Immutables memory immutables2 = IBaseEscrow.Immutables({
            orderHash: keccak256(abi.encode(order, "fill2")),
            hashlock: keccak256(abi.encode("test-secret-2")),
            maker: uint160(order.maker),
            taker: uint160(resolver),
            token: uint160(token),
            amount: 40e6,
            safetyDeposit: 4e6,
            timelocks: 0
        });
        
        try UniteResolver(payable(resolverContract)).fillOrder{value: 0.01 ether}(
            immutables2,
            order,
            block.timestamp + 3600,
            40e6 // Fill remaining 40 USDT
        ) {
            console.log("SUCCESS: Second fill (40 USDT) completed - order should be complete");
        } catch Error(string memory reason) {
            console.log("ERROR: Second fill failed:", reason);
        }
        
        // Check if order is now completed
        isFullyFilled = lop.isOrderFullyFilled(orderHash);
        console.log("Order fully filled after second fill:", isFullyFilled);
        
        remainingAmount = lop.getRemainingAmountByOrder(order);
        console.log("Remaining amount after completion:", remainingAmount / 1e6, "USDT");
        
        // Try to fill more - this should fail
        console.log("\n3. Attempting to fill completed order (should fail)...");
        
        IBaseEscrow.Immutables memory immutables3 = IBaseEscrow.Immutables({
            orderHash: keccak256(abi.encode(order, "fill3")),
            hashlock: keccak256(abi.encode("test-secret-3")),
            maker: uint160(order.maker),
            taker: uint160(resolver),
            token: uint160(token),
            amount: 10e6,
            safetyDeposit: 1e6,
            timelocks: 0
        });
        
        try UniteResolver(payable(resolverContract)).fillOrder{value: 0.01 ether}(
            immutables3,
            order,
            block.timestamp + 3600,
            10e6 // Try to fill 10 more USDT
        ) {
            console.log("UNEXPECTED: Third fill succeeded (this shouldn't happen!)");
        } catch Error(string memory reason) {
            console.log("SUCCESS: Third fill properly rejected:", reason);
        } catch (bytes memory) {
            console.log("SUCCESS: Third fill properly rejected (low-level revert)");
        }
        
        vm.stopBroadcast();
    }
    
    function getContractAddresses() internal view returns (address limitOrder, address escrowFactory, address usdt, address resolver) {
        uint256 chainId = block.chainid;
        
        // Base Sepolia
        if (chainId == 84532) {
            return (
                0xA97E6f3e821Bea748491455e8b549624541c3bCD,
                0x299A56522b1E1eb0319A52B84c7011dCAfFdEea4,
                0x97a2d8Dfece96252518a4327aFFf40B61A0a025A,
                0xB5b0Be784A50c458dAC31d267EcC6Afde21393EB
            );
        }
        
        // Arbitrum Sepolia
        if (chainId == 421614) {
            return (
                0x20BD36142F24D656373a3BD94194009045A07244,
                0xfdF57804735277Dd87332DcAB6F6D1e446C0D3eB,
                0x84159eadE815141727FeE309fDdaaf7BCF36cFF9,
                0x2F82563689c75Bc987038b1584f3F9c306a4c93D
            );
        }
        
        revert("Chain not configured for testing");
    }
}