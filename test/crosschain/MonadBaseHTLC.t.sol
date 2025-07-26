// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {SimpleDutchAuction} from "../../contracts/src/SimpleDutchAuction.sol";
import {MockToken} from "../../contracts/src/MockToken.sol";

contract MonadBaseHTLC is Test {
    // Monad contracts
    SimpleDutchAuction auctionMonad;
    MockToken tokenOnMonad;
    SimpleEscrow escrowMonad;
    
    // Base Sepolia contracts  
    MockToken tokenOnBase;
    SimpleEscrow escrowBase;
    
    // Test accounts
    address constant SELLER = address(0x1111111111111111111111111111111111111111);
    address constant RESOLVER = address(0x2222222222222222222222222222222222222222);
    
    // Fork IDs
    uint256 monadFork;
    uint256 baseFork;
    
    // HTLC parameters
    bytes32 constant SECRET = keccak256("test-secret-12345");
    bytes32 constant HASHLOCK = keccak256(abi.encodePacked(SECRET));

    function setUp() public {
        // Setup forks
        monadFork = vm.createFork("monad");
        baseFork = vm.createFork("base_sepolia");
        
        // Deploy on Monad
        vm.selectFork(monadFork);
        console.log("Deploying on Monad (chain ID: %s)", block.chainid);
        
        tokenOnMonad = new MockToken("USDC on Monad", "USDC.m", 6);
        auctionMonad = new SimpleDutchAuction();
        escrowMonad = new SimpleEscrow();
        
        console.log("Monad contracts deployed:");
        console.log("  Token: %s", address(tokenOnMonad));
        console.log("  Auction: %s", address(auctionMonad));
        console.log("  Escrow: %s", address(escrowMonad));
        
        // Deploy on Base Sepolia
        vm.selectFork(baseFork);
        console.log("\nDeploying on Base Sepolia (chain ID: %s)", block.chainid);
        
        tokenOnBase = new MockToken("USDC on Base", "USDC.b", 6);
        escrowBase = new SimpleEscrow();
        
        console.log("Base Sepolia contracts deployed:");
        console.log("  Token: %s", address(tokenOnBase));
        console.log("  Escrow: %s", address(escrowBase));
        
        // Fund test accounts on both chains
        vm.selectFork(monadFork);
        vm.deal(SELLER, 10 ether);
        vm.deal(RESOLVER, 10 ether);
        
        vm.selectFork(baseFork);
        vm.deal(SELLER, 10 ether);
        vm.deal(RESOLVER, 10 ether);
    }

    function test_FullHTLCFlow() public {
        console.log("\n=== Starting Full HTLC Flow Test ===");
        
        uint256 tokenAmount = 1000 * 10**6; // 1000 USDC
        uint256 startPrice = 1.1 ether;
        uint256 endPrice = 0.9 ether;
        uint256 duration = 1 hours;
        bytes32 auctionId = keccak256("test-auction-001");
        
        // Phase 1: Create and settle auction on Monad
        vm.selectFork(monadFork);
        console.log("\n[Phase 1] Creating auction on Monad");
        
        vm.startPrank(SELLER);
        tokenOnMonad.mint(SELLER, tokenAmount);
        tokenOnMonad.approve(address(auctionMonad), tokenAmount);
        
        uint256 gasStart = gasleft();
        auctionMonad.createAuction(
            auctionId,
            address(tokenOnMonad),
            tokenAmount,
            startPrice,
            endPrice,
            duration
        );
        console.log("Gas used for auction creation: %s", gasStart - gasleft());
        vm.stopPrank();
        
        // Fast forward and settle
        vm.warp(block.timestamp + 30 minutes);
        uint256 currentPrice = auctionMonad.getCurrentPrice(auctionId);
        console.log("Current auction price: %s wei", currentPrice);
        
        vm.startPrank(RESOLVER);
        gasStart = gasleft();
        auctionMonad.settleAuction{value: currentPrice}(auctionId);
        console.log("Gas used for auction settlement: %s", gasStart - gasleft());
        vm.stopPrank();
        
        assertEq(tokenOnMonad.balanceOf(RESOLVER), tokenAmount, "Resolver should have tokens");
        
        // Phase 2: Create HTLC escrows on both chains
        console.log("\n[Phase 2] Creating HTLC escrows");
        
        // Create source escrow on Monad (Resolver locks tokens)
        vm.startPrank(RESOLVER);
        tokenOnMonad.approve(address(escrowMonad), tokenAmount);
        
        gasStart = gasleft();
        escrowMonad.createHTLC{value: 0.001 ether}(
            HASHLOCK,
            address(tokenOnMonad),
            tokenAmount,
            SELLER,
            block.timestamp + 2 hours
        );
        console.log("Gas used for Monad escrow: %s", gasStart - gasleft());
        vm.stopPrank();
        
        // Create destination escrow on Base (Seller locks payment)
        vm.selectFork(baseFork);
        vm.startPrank(SELLER);
        
        gasStart = gasleft();
        escrowBase.createHTLC{value: currentPrice + 0.001 ether}(
            HASHLOCK,
            address(0), // ETH
            currentPrice,
            RESOLVER,
            block.timestamp + 1 hours
        );
        console.log("Gas used for Base escrow: %s", gasStart - gasleft());
        vm.stopPrank();
        
        // Phase 3: Seller withdraws from Base using secret
        console.log("\n[Phase 3] Executing atomic swap");
        
        vm.startPrank(SELLER);
        uint256 sellerBalanceBefore = SELLER.balance;
        
        gasStart = gasleft();
        escrowBase.withdraw(SECRET, HASHLOCK);
        console.log("Gas used for Base withdrawal: %s", gasStart - gasleft());
        
        assertEq(SELLER.balance - sellerBalanceBefore, currentPrice + 0.001 ether, "Seller should receive payment");
        vm.stopPrank();
        
        // Phase 4: Resolver withdraws from Monad using revealed secret
        vm.selectFork(monadFork);
        vm.startPrank(RESOLVER);
        
        gasStart = gasleft();
        escrowMonad.withdraw(SECRET, HASHLOCK);
        console.log("Gas used for Monad withdrawal: %s", gasStart - gasleft());
        
        assertEq(tokenOnMonad.balanceOf(SELLER), tokenAmount, "Seller should have tokens");
        vm.stopPrank();
        
        console.log("\n=== HTLC Flow Completed Successfully ===");
        console.log("Final state:");
        console.log("  Seller has %s USDC on Monad", tokenOnMonad.balanceOf(SELLER) / 10**6);
        vm.selectFork(baseFork);
        console.log("  Seller has %s ETH on Base", SELLER.balance / 10**18);
    }

    function test_TimeoutScenario() public {
        console.log("\n=== Starting Timeout Scenario Test ===");
        
        uint256 tokenAmount = 500 * 10**6; // 500 USDC
        uint256 price = 0.5 ether;
        
        // Setup: Give tokens to resolver
        vm.selectFork(monadFork);
        vm.prank(SELLER);
        tokenOnMonad.mint(RESOLVER, tokenAmount);
        
        // Create escrows
        vm.startPrank(RESOLVER);
        tokenOnMonad.approve(address(escrowMonad), tokenAmount);
        escrowMonad.createHTLC{value: 0.001 ether}(
            HASHLOCK,
            address(tokenOnMonad),
            tokenAmount,
            SELLER,
            block.timestamp + 30 minutes
        );
        vm.stopPrank();
        
        vm.selectFork(baseFork);
        vm.startPrank(SELLER);
        escrowBase.createHTLC{value: price + 0.001 ether}(
            HASHLOCK,
            address(0),
            price,
            RESOLVER,
            block.timestamp + 20 minutes
        );
        vm.stopPrank();
        
        // Fast forward past timeout
        vm.warp(block.timestamp + 1 hours);
        
        // Cancel on Base
        console.log("Cancelling on Base after timeout");
        vm.startPrank(SELLER);
        uint256 balanceBefore = SELLER.balance;
        escrowBase.cancel(HASHLOCK);
        assertEq(SELLER.balance - balanceBefore, price + 0.001 ether, "Seller should get refund");
        vm.stopPrank();
        
        // Cancel on Monad
        vm.selectFork(monadFork);
        vm.warp(block.timestamp + 1 hours);
        
        console.log("Cancelling on Monad after timeout");
        vm.startPrank(RESOLVER);
        escrowMonad.cancel(HASHLOCK);
        assertEq(tokenOnMonad.balanceOf(RESOLVER), tokenAmount, "Resolver should get tokens back");
        vm.stopPrank();
        
        console.log("\n=== Timeout Scenario Completed Successfully ===");
    }

    function test_EventEmission() public {
        console.log("\n=== Testing Event Emission ===");
        
        uint256 tokenAmount = 100 * 10**6;
        bytes32 auctionId = keccak256("event-test");
        
        // Test auction creation event
        vm.selectFork(monadFork);
        vm.startPrank(SELLER);
        tokenOnMonad.mint(SELLER, tokenAmount);
        tokenOnMonad.approve(address(auctionMonad), tokenAmount);
        
        vm.expectEmit(true, true, true, true);
        emit SimpleDutchAuction.AuctionCreated(
            auctionId,
            SELLER,
            address(tokenOnMonad),
            tokenAmount,
            1 ether,
            0.5 ether,
            block.timestamp + 1 hours
        );
        
        auctionMonad.createAuction(
            auctionId,
            address(tokenOnMonad),
            tokenAmount,
            1 ether,
            0.5 ether,
            1 hours
        );
        vm.stopPrank();
        
        // Test HTLC creation event
        vm.startPrank(RESOLVER);
        tokenOnMonad.mint(RESOLVER, tokenAmount);
        tokenOnMonad.approve(address(escrowMonad), tokenAmount);
        
        vm.expectEmit(true, true, true, true);
        emit SimpleEscrow.HTLCCreated(HASHLOCK, RESOLVER, SELLER, tokenAmount);
        
        escrowMonad.createHTLC{value: 0.001 ether}(
            HASHLOCK,
            address(tokenOnMonad),
            tokenAmount,
            SELLER,
            block.timestamp + 1 hours
        );
        vm.stopPrank();
        
        console.log("All events emitted correctly");
    }
}

// Simple HTLC Escrow contract for testing
contract SimpleEscrow {
    struct HTLC {
        address sender;
        address receiver;
        address token;
        uint256 amount;
        bytes32 hashlock;
        uint256 timeout;
        bool withdrawn;
        bool cancelled;
    }
    
    mapping(bytes32 => HTLC) public htlcs;
    
    event HTLCCreated(bytes32 indexed hashlock, address sender, address receiver, uint256 amount);
    event HTLCWithdrawn(bytes32 indexed hashlock, bytes32 secret);
    event HTLCCancelled(bytes32 indexed hashlock);
    
    function createHTLC(
        bytes32 hashlock,
        address token,
        uint256 amount,
        address receiver,
        uint256 timeout
    ) external payable {
        require(htlcs[hashlock].sender == address(0), "HTLC already exists");
        require(timeout > block.timestamp, "Timeout must be in future");
        
        uint256 totalValue = amount;
        if (token == address(0)) {
            totalValue += 0.001 ether; // safety deposit
            require(msg.value == totalValue, "Incorrect ETH amount");
        } else {
            require(msg.value == 0.001 ether, "Safety deposit required");
            MockToken(token).transferFrom(msg.sender, address(this), amount);
        }
        
        htlcs[hashlock] = HTLC({
            sender: msg.sender,
            receiver: receiver,
            token: token,
            amount: amount,
            hashlock: hashlock,
            timeout: timeout,
            withdrawn: false,
            cancelled: false
        });
        
        emit HTLCCreated(hashlock, msg.sender, receiver, amount);
    }
    
    function withdraw(bytes32 secret, bytes32 hashlock) external {
        require(keccak256(abi.encodePacked(secret)) == hashlock, "Invalid secret");
        
        HTLC storage htlc = htlcs[hashlock];
        require(!htlc.withdrawn, "Already withdrawn");
        require(!htlc.cancelled, "Already cancelled");
        require(block.timestamp < htlc.timeout, "Timeout reached");
        
        htlc.withdrawn = true;
        
        if (htlc.token == address(0)) {
            payable(htlc.receiver).transfer(htlc.amount + 0.001 ether);
        } else {
            MockToken(htlc.token).transfer(htlc.receiver, htlc.amount);
            payable(htlc.receiver).transfer(0.001 ether);
        }
        
        emit HTLCWithdrawn(hashlock, secret);
    }
    
    function cancel(bytes32 hashlock) external {
        HTLC storage htlc = htlcs[hashlock];
        require(msg.sender == htlc.sender, "Only sender can cancel");
        require(!htlc.withdrawn, "Already withdrawn");
        require(!htlc.cancelled, "Already cancelled");
        require(block.timestamp >= htlc.timeout, "Timeout not reached");
        
        htlc.cancelled = true;
        
        if (htlc.token == address(0)) {
            payable(htlc.sender).transfer(htlc.amount + 0.001 ether);
        } else {
            MockToken(htlc.token).transfer(htlc.sender, htlc.amount);
            payable(htlc.sender).transfer(0.001 ether);
        }
        
        emit HTLCCancelled(hashlock);
    }
}