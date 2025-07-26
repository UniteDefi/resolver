// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {SimpleDutchAuction} from "../../contracts/src/SimpleDutchAuction.sol";
import {MockToken} from "../../contracts/src/MockToken.sol";

contract EtherlinkBaseHTLC is Test {
    // Etherlink contracts
    SimpleDutchAuction auctionEtherlink;
    MockToken tokenOnEtherlink;
    SimpleEscrow escrowEtherlink;
    
    // Base Sepolia contracts  
    MockToken tokenOnBase;
    SimpleEscrow escrowBase;
    
    // Test accounts
    address constant SELLER = address(0x1111111111111111111111111111111111111111);
    address constant RESOLVER = address(0x2222222222222222222222222222222222222222);
    
    // Fork IDs
    uint256 etherlinkFork;
    uint256 baseFork;
    
    // HTLC parameters
    bytes32 constant SECRET = keccak256("test-secret-etherlink");
    bytes32 constant HASHLOCK = keccak256(abi.encodePacked(SECRET));

    function setUp() public {
        // Setup forks
        etherlinkFork = vm.createFork("etherlink");
        baseFork = vm.createFork("base_sepolia");
        
        // Deploy on Etherlink
        vm.selectFork(etherlinkFork);
        console.log("Deploying on Etherlink (chain ID: %s)", block.chainid);
        
        tokenOnEtherlink = new MockToken("USDC on Etherlink", "USDC.e", 6);
        auctionEtherlink = new SimpleDutchAuction();
        escrowEtherlink = new SimpleEscrow();
        
        console.log("Etherlink contracts deployed:");
        console.log("  Token: %s", address(tokenOnEtherlink));
        console.log("  Auction: %s", address(auctionEtherlink));
        console.log("  Escrow: %s", address(escrowEtherlink));
        
        // Deploy on Base Sepolia
        vm.selectFork(baseFork);
        console.log("\nDeploying on Base Sepolia (chain ID: %s)", block.chainid);
        
        tokenOnBase = new MockToken("USDC on Base", "USDC.b", 6);
        escrowBase = new SimpleEscrow();
        
        console.log("Base Sepolia contracts deployed:");
        console.log("  Token: %s", address(tokenOnBase));
        console.log("  Escrow: %s", address(escrowBase));
        
        // Fund test accounts on both chains
        vm.selectFork(etherlinkFork);
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
        bytes32 auctionId = keccak256("test-auction-etherlink-001");
        
        // Phase 1: Create and settle auction on Etherlink
        vm.selectFork(etherlinkFork);
        console.log("\n[Phase 1] Creating auction on Etherlink");
        
        vm.startPrank(SELLER);
        tokenOnEtherlink.mint(SELLER, tokenAmount);
        tokenOnEtherlink.approve(address(auctionEtherlink), tokenAmount);
        
        uint256 gasStart = gasleft();
        auctionEtherlink.createAuction(
            auctionId,
            address(tokenOnEtherlink),
            tokenAmount,
            startPrice,
            endPrice,
            duration
        );
        console.log("Gas used for auction creation: %s", gasStart - gasleft());
        vm.stopPrank();
        
        // Fast forward and settle
        vm.warp(block.timestamp + 30 minutes);
        uint256 currentPrice = auctionEtherlink.getCurrentPrice(auctionId);
        console.log("Current auction price: %s wei", currentPrice);
        
        vm.startPrank(RESOLVER);
        gasStart = gasleft();
        auctionEtherlink.settleAuction{value: currentPrice}(auctionId);
        console.log("Gas used for auction settlement: %s", gasStart - gasleft());
        vm.stopPrank();
        
        assertEq(tokenOnEtherlink.balanceOf(RESOLVER), tokenAmount, "Resolver should have tokens");
        
        // Phase 2: Create HTLC escrows on both chains
        console.log("\n[Phase 2] Creating HTLC escrows");
        
        // Create source escrow on Etherlink (Resolver locks tokens)
        vm.startPrank(RESOLVER);
        tokenOnEtherlink.approve(address(escrowEtherlink), tokenAmount);
        
        gasStart = gasleft();
        escrowEtherlink.createHTLC{value: 0.001 ether}(
            HASHLOCK,
            address(tokenOnEtherlink),
            tokenAmount,
            SELLER,
            block.timestamp + 2 hours
        );
        console.log("Gas used for Etherlink escrow: %s", gasStart - gasleft());
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
        
        // Phase 4: Resolver withdraws from Etherlink using revealed secret
        vm.selectFork(etherlinkFork);
        vm.startPrank(RESOLVER);
        
        gasStart = gasleft();
        escrowEtherlink.withdraw(SECRET, HASHLOCK);
        console.log("Gas used for Etherlink withdrawal: %s", gasStart - gasleft());
        
        assertEq(tokenOnEtherlink.balanceOf(SELLER), tokenAmount, "Seller should have tokens");
        vm.stopPrank();
        
        console.log("\n=== HTLC Flow Completed Successfully ===");
        console.log("Final state:");
        console.log("  Seller has %s USDC on Etherlink", tokenOnEtherlink.balanceOf(SELLER) / 10**6);
        vm.selectFork(baseFork);
        console.log("  Seller has %s ETH on Base", SELLER.balance / 10**18);
        
        // Log gas cost comparison
        console.log("\n=== Gas Cost Analysis ===");
        console.log("Etherlink is Tezos' EVM-compatible L2 with lower fees");
    }

    function test_TimeoutScenario() public {
        console.log("\n=== Starting Timeout Scenario Test ===");
        
        uint256 tokenAmount = 500 * 10**6; // 500 USDC
        uint256 price = 0.5 ether;
        
        // Setup: Give tokens to resolver
        vm.selectFork(etherlinkFork);
        vm.prank(SELLER);
        tokenOnEtherlink.mint(RESOLVER, tokenAmount);
        
        // Create escrows
        vm.startPrank(RESOLVER);
        tokenOnEtherlink.approve(address(escrowEtherlink), tokenAmount);
        escrowEtherlink.createHTLC{value: 0.001 ether}(
            HASHLOCK,
            address(tokenOnEtherlink),
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
        
        // Cancel on Etherlink
        vm.selectFork(etherlinkFork);
        vm.warp(block.timestamp + 1 hours);
        
        console.log("Cancelling on Etherlink after timeout");
        vm.startPrank(RESOLVER);
        escrowEtherlink.cancel(HASHLOCK);
        assertEq(tokenOnEtherlink.balanceOf(RESOLVER), tokenAmount, "Resolver should get tokens back");
        vm.stopPrank();
        
        console.log("\n=== Timeout Scenario Completed Successfully ===");
    }
    
    function test_EdgeCases() public {
        console.log("\n=== Testing Edge Cases ===");
        
        // Test 1: Wrong secret
        vm.selectFork(etherlinkFork);
        uint256 amount = 100 * 10**6;
        
        vm.startPrank(RESOLVER);
        tokenOnEtherlink.mint(RESOLVER, amount);
        tokenOnEtherlink.approve(address(escrowEtherlink), amount);
        escrowEtherlink.createHTLC{value: 0.001 ether}(
            HASHLOCK,
            address(tokenOnEtherlink),
            amount,
            SELLER,
            block.timestamp + 1 hours
        );
        
        bytes32 wrongSecret = keccak256("wrong-secret");
        vm.expectRevert("Invalid secret");
        escrowEtherlink.withdraw(wrongSecret, HASHLOCK);
        vm.stopPrank();
        
        console.log("✓ Wrong secret rejection works");
        
        // Test 2: Duplicate HTLC
        vm.expectRevert("HTLC already exists");
        vm.prank(RESOLVER);
        escrowEtherlink.createHTLC{value: 0.001 ether}(
            HASHLOCK,
            address(tokenOnEtherlink),
            amount,
            SELLER,
            block.timestamp + 1 hours
        );
        
        console.log("✓ Duplicate HTLC prevention works");
        
        // Test 3: Early cancellation attempt
        vm.expectRevert("Timeout not reached");
        vm.prank(RESOLVER);
        escrowEtherlink.cancel(HASHLOCK);
        
        console.log("✓ Early cancellation prevention works");
        
        console.log("\n=== All Edge Cases Passed ===");
    }
    
    function test_GasComparison() public {
        console.log("\n=== Gas Cost Comparison: Etherlink vs Base ===");
        
        uint256 amount = 100 * 10**6;
        bytes32 testHashlock = keccak256("gas-test");
        
        // Measure Etherlink gas
        vm.selectFork(etherlinkFork);
        vm.startPrank(RESOLVER);
        tokenOnEtherlink.mint(RESOLVER, amount);
        tokenOnEtherlink.approve(address(escrowEtherlink), amount);
        
        uint256 etherlinkGas = gasleft();
        escrowEtherlink.createHTLC{value: 0.001 ether}(
            testHashlock,
            address(tokenOnEtherlink),
            amount,
            SELLER,
            block.timestamp + 1 hours
        );
        etherlinkGas = etherlinkGas - gasleft();
        vm.stopPrank();
        
        // Measure Base gas
        vm.selectFork(baseFork);
        vm.startPrank(RESOLVER);
        tokenOnBase.mint(RESOLVER, amount);
        tokenOnBase.approve(address(escrowBase), amount);
        
        uint256 baseGas = gasleft();
        escrowBase.createHTLC{value: 0.001 ether}(
            keccak256("gas-test-2"),
            address(tokenOnBase),
            amount,
            SELLER,
            block.timestamp + 1 hours
        );
        baseGas = baseGas - gasleft();
        vm.stopPrank();
        
        console.log("Gas used for HTLC creation:");
        console.log("  Etherlink: %s", etherlinkGas);
        console.log("  Base Sepolia: %s", baseGas);
        console.log("  Difference: %s", int256(baseGas) - int256(etherlinkGas));
        console.log("\nNote: Etherlink typically has lower gas fees than Ethereum L2s");
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