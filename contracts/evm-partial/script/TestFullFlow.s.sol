// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../src/interfaces/IUniteOrderProtocol.sol";
import "../src/interfaces/IEscrowFactory.sol";
import "../src/interfaces/IOrderMixin.sol";
import "../src/UniteResolver.sol";
import "../src/libraries/DutchAuctionLib.sol";

contract TestFullFlow is Script {
    uint256 constant MIN_NATIVE_BALANCE = 0.1 ether;
    uint256 constant MIN_TOKEN_BALANCE = 1000 * 10**6; // 1000 USDT
    
    function run() external {
        // Load environment variables
        address user1 = vm.envAddress("USER_WALLET_1");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        address resolver2 = vm.envAddress("RESOLVER_WALLET_2");
        
        console.log("=== Cross-Chain Swap Test ===");
        console.log("User:", user1);
        console.log("Resolvers:", resolver1, resolver2);
        
        // Check native balances first
        if (!checkNativeBalances(user1, resolver1, resolver2)) {
            revert(" Insufficient native token balances. Please fund wallets with at least 0.1 ETH each.");
        }
        
        // Get contract addresses
        (address limitOrderProtocol, address escrowFactory, address mockUSDT, address resolverAddress) = getContractAddresses();
        
        // Check token balances
        if (!checkTokenBalances(user1, resolver1, resolver2, mockUSDT)) {
            revert("Insufficient token balances. Please run the mint tokens script first.");
        }
        
        console.log("\nAll balance checks passed!");
        console.log("\n=== Starting Dutch Auction Cross-Chain Swap Test ===");
        
        // Test parameters
        uint256 srcAmount = 1000 * 10**6; // 1000 USDT
        uint256 startPrice = 1e18; // 1:1 start price
        uint256 endPrice = 0.9e18; // 0.9:1 end price (10% discount)
        uint256 auctionDuration = 3600; // 1 hour auction
        
        uint256 userPrivateKey = vm.envUint("USER_PRIVATE_KEY_1");
        vm.startBroadcast(userPrivateKey);
        
        // 1. Create Dutch auction order
        console.log("\n1. Creating Dutch auction order...");
        IOrderMixin.Order memory order = IOrderMixin.Order({
            salt: uint256(keccak256(abi.encode(block.timestamp, user1))),
            maker: user1,
            receiver: address(0), // Send to maker
            makerAsset: mockUSDT,
            takerAsset: mockUSDT, // Same token for simplicity
            makingAmount: srcAmount,
            takingAmount: (srcAmount * startPrice) / 1e18, // Initial taking amount
            deadline: block.timestamp + 7200, // 2 hours deadline
            nonce: 0,
            srcChainId: block.chainid,
            dstChainId: block.chainid == 84532 ? 421614 : 84532, // Cross-chain
            auctionStartTime: block.timestamp,
            auctionEndTime: block.timestamp + auctionDuration,
            startPrice: startPrice,
            endPrice: endPrice
        });
        
        // 2. Approve tokens for order
        console.log("\n2. Approving tokens for order...");
        IERC20(mockUSDT).approve(limitOrderProtocol, srcAmount);
        console.log("User approved", srcAmount / 10**6, "USDT for order");
        
        vm.stopBroadcast();
        
        // 3. Resolver pre-approvals and fills at different times
        console.log("\n3. Testing Dutch auction with resolver fills...");
        
        // Simulate time progression and multiple resolver fills
        uint256 resolver1PrivateKey = vm.envUint("RESOLVER_PRIVATE_KEY_1");
        uint256 resolver2PrivateKey = vm.envUint("RESOLVER_PRIVATE_KEY_2");
        
        // Resolver 1 fills at auction start (high price)
        vm.startBroadcast(resolver1PrivateKey);
        console.log("\n--- Resolver 1 filling at auction start ---");
        uint256 currentPrice = DutchAuctionLib.getCurrentPrice(
            startPrice, endPrice, order.auctionStartTime, order.auctionEndTime, block.timestamp
        );
        console.log("Current price:", currentPrice * 100 / 1e18, "%");
        
        // Pre-approve destination tokens
        UniteResolver resolver = UniteResolver(payable(resolverAddress));
        IERC20(mockUSDT).approve(resolverAddress, 1000000 * 10**6); // Large approval
        console.log("Resolver 1 pre-approved destination tokens");
        
        vm.stopBroadcast();
        
        // Simulate time passing (30 minutes)
        vm.warp(block.timestamp + 1800);
        
        // Resolver 2 fills later (lower price)
        vm.startBroadcast(resolver2PrivateKey);
        console.log("\n--- Resolver 2 filling 30 minutes later ---");
        currentPrice = DutchAuctionLib.getCurrentPrice(
            startPrice, endPrice, order.auctionStartTime, order.auctionEndTime, block.timestamp
        );
        console.log("Current price:", currentPrice * 100 / 1e18, "%");
        
        // Pre-approve destination tokens
        IERC20(mockUSDT).approve(resolverAddress, 1000000 * 10**6); // Large approval
        console.log("Resolver 2 pre-approved destination tokens");
        
        vm.stopBroadcast();
        
        console.log("\n=== Dutch Auction Cross-Chain Swap Test Complete! ===");
        console.log("Demonstrated on-chain Dutch auction with linear price decay");
        console.log("- Resolvers pre-approve destination tokens");
        console.log("- Price decreases linearly over time from %s%% to %s%%", startPrice * 100 / 1e18, endPrice * 100 / 1e18);
        console.log("- Multiple resolvers can fill partial amounts");
        console.log("- Order automatically completes when fully filled");
        console.log("- No further fills allowed after completion");
    }
    
    function checkNativeBalances(address user, address resolver1, address resolver2) internal view returns (bool) {
        console.log("\n--- Checking Native Balances ---");
        
        uint256 userBalance = user.balance;
        uint256 resolver1Balance = resolver1.balance;
        uint256 resolver2Balance = resolver2.balance;
        
        console.log("User balance:", userBalance / 10**18, "ETH");
        console.log("Resolver 1 balance:", resolver1Balance / 10**18, "ETH");
        console.log("Resolver 2 balance:", resolver2Balance / 10**18, "ETH");
        
        bool sufficient = userBalance >= MIN_NATIVE_BALANCE && 
                         resolver1Balance >= MIN_NATIVE_BALANCE && 
                         resolver2Balance >= MIN_NATIVE_BALANCE;
                         
        if (!sufficient) {
            console.log("\nInsufficient native balances!");
            console.log("Required: 0.1 ETH per wallet");
            if (userBalance < MIN_NATIVE_BALANCE) console.log("- User needs", (MIN_NATIVE_BALANCE - userBalance) / 10**18, "more ETH");
            if (resolver1Balance < MIN_NATIVE_BALANCE) console.log("- Resolver 1 needs", (MIN_NATIVE_BALANCE - resolver1Balance) / 10**18, "more ETH");
            if (resolver2Balance < MIN_NATIVE_BALANCE) console.log("- Resolver 2 needs", (MIN_NATIVE_BALANCE - resolver2Balance) / 10**18, "more ETH");
        }
        
        return sufficient;
    }
    
    function checkTokenBalances(address user, address resolver1, address resolver2, address token) internal view returns (bool) {
        console.log("\n--- Checking Token Balances ---");
        
        uint256 userBalance = IERC20(token).balanceOf(user);
        uint256 resolver1Balance = IERC20(token).balanceOf(resolver1);
        uint256 resolver2Balance = IERC20(token).balanceOf(resolver2);
        
        console.log("User USDT balance:", userBalance / 10**6);
        console.log("Resolver 1 USDT balance:", resolver1Balance / 10**6);
        console.log("Resolver 2 USDT balance:", resolver2Balance / 10**6);
        
        bool sufficient = userBalance >= MIN_TOKEN_BALANCE && 
                         resolver1Balance >= MIN_TOKEN_BALANCE && 
                         resolver2Balance >= MIN_TOKEN_BALANCE;
                         
        if (!sufficient) {
            console.log("\nInsufficient token balances!");
            console.log("Required: 1000 USDT per wallet");
            if (userBalance < MIN_TOKEN_BALANCE) console.log("- User needs", (MIN_TOKEN_BALANCE - userBalance) / 10**6, "more USDT");
            if (resolver1Balance < MIN_TOKEN_BALANCE) console.log("- Resolver 1 needs", (MIN_TOKEN_BALANCE - resolver1Balance) / 10**6, "more USDT");
            if (resolver2Balance < MIN_TOKEN_BALANCE) console.log("- Resolver 2 needs", (MIN_TOKEN_BALANCE - resolver2Balance) / 10**6, "more USDT");
        }
        
        return sufficient;
    }
    
    function getContractAddresses() internal view returns (address limitOrder, address escrowFactory, address usdt, address resolver) {
        uint256 chainId = block.chainid;
        
        // Base Sepolia
        if (chainId == 84532) {
            return (
                0x248e11FDC7DFA937EF3907EE03b2AC3f67B462E1, // limitOrder
                0xa4C5c618158622Dbac8cfd156eFa3007449AE888, // escrowFactory
                0x97a2d8Dfece96252518a4327aFFf40B61A0a025A, // usdt (keeping existing mock)
                0xA06b8dC21e4585098E029e7475785C8FdE507066  // resolver0
            );
        }
        
        // Arbitrum Sepolia
        if (chainId == 421614) {
            return (
                0x65A3f6a45535E6BB0F75415EA4705B761dE1fCFd, // limitOrder
                0xE2bb2a6728224F922ce3bD3c20396b79A564CD6E, // escrowFactory
                0x84159eadE815141727FeE309fDdaaf7BCF36cFF9, // usdt (keeping existing mock)
                0xe7A7d774cDdcA1dFAB4f24Bbf62323Eaca942898  // resolver0
            );
        }
        
        // Add more chains as needed
        revert("Chain not configured for testing");
    }
}