// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {SimpleDutchAuction} from "../../contracts/src/SimpleDutchAuction.sol";
import {MockToken} from "../../contracts/src/MockToken.sol";
import {EnhancedEscrowFactory} from "../../contracts/src/EnhancedEscrowFactory.sol";
import {UniteResolverV2} from "../../contracts/src/UniteResolverV2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract EtherlinkBaseHTLCV2 is Test {
    // Core contracts
    SimpleDutchAuction auctionEtherlink;
    SimpleDutchAuction auctionBase;
    MockToken tokenOnEtherlink;
    MockToken tokenOnBase;
    EnhancedEscrowFactory escrowFactoryEtherlink;
    EnhancedEscrowFactory escrowFactoryBase;
    UniteResolverV2 resolverContractEtherlink;
    UniteResolverV2 resolverContractBase;
    SimpleEscrow escrowEtherlink;
    SimpleEscrow escrowBase;
    
    // Test accounts
    address constant USER = address(0x1111111111111111111111111111111111111111);
    address constant RESOLVER = address(0x2222222222222222222222222222222222222222);
    address constant RELAYER = address(0x3333333333333333333333333333333333333333);
    
    // Fork IDs
    uint256 etherlinkFork;
    uint256 baseFork;
    
    // HTLC parameters
    bytes32 constant SECRET = keccak256("test-secret-v2");
    bytes32 constant HASHLOCK = keccak256(abi.encodePacked(SECRET));
    
    // Safety deposit
    uint256 constant SAFETY_DEPOSIT = 0.001 ether;

    function setUp() public {
        // Setup forks
        etherlinkFork = vm.createFork("etherlink");
        baseFork = vm.createFork("base_sepolia");
        
        // Deploy on Etherlink
        vm.selectFork(etherlinkFork);
        console.log("=== Deploying V2 Architecture on Etherlink ===");
        
        tokenOnEtherlink = new MockToken("USDC on Etherlink", "USDC.e", 6);
        auctionEtherlink = new SimpleDutchAuction();
        
        // Deploy enhanced escrow factory (mock parameters for testing)
        escrowFactoryEtherlink = new EnhancedEscrowFactory(
            address(this), // mock limit order protocol
            IERC20(address(tokenOnEtherlink)), // fee token
            IERC20(address(tokenOnEtherlink)), // access token
            address(this), // owner
            7200, // rescue delay src
            7200  // rescue delay dst
        );
        
        // Mock resolver contract (simplified for testing)
        resolverContractEtherlink = new UniteResolverV2(
            escrowFactoryEtherlink,
            address(this), // mock order mixin
            address(this), // owner
            address(auctionEtherlink)
        );
        
        escrowEtherlink = new SimpleEscrow();
        
        console.log("Etherlink V2 contracts deployed:");
        console.log("  Token: %s", address(tokenOnEtherlink));
        console.log("  Auction: %s", address(auctionEtherlink));
        console.log("  EscrowFactory: %s", address(escrowFactoryEtherlink));
        console.log("  Resolver: %s", address(resolverContractEtherlink));
        
        // Deploy on Base Sepolia
        vm.selectFork(baseFork);
        console.log("\n=== Deploying V2 Architecture on Base Sepolia ===");
        
        tokenOnBase = new MockToken("USDC on Base", "USDC.b", 6);
        auctionBase = new SimpleDutchAuction();
        
        escrowFactoryBase = new EnhancedEscrowFactory(
            address(this),
            IERC20(address(tokenOnBase)),
            IERC20(address(tokenOnBase)),
            address(this),
            7200,
            7200
        );
        
        resolverContractBase = new UniteResolverV2(
            escrowFactoryBase,
            address(this),
            address(this),
            address(auctionBase)
        );
        
        escrowBase = new SimpleEscrow();
        
        console.log("Base Sepolia V2 contracts deployed:");
        console.log("  Token: %s", address(tokenOnBase));
        console.log("  Auction: %s", address(auctionBase));
        console.log("  EscrowFactory: %s", address(escrowFactoryBase));
        console.log("  Resolver: %s", address(resolverContractBase));
        
        // Fund test accounts on both chains
        vm.selectFork(etherlinkFork);
        vm.deal(USER, 10 ether);
        vm.deal(RESOLVER, 10 ether);
        vm.deal(RELAYER, 10 ether);
        
        vm.selectFork(baseFork);
        vm.deal(USER, 10 ether);
        vm.deal(RESOLVER, 10 ether);
        vm.deal(RELAYER, 10 ether);
        
        // Authorize relayer on both chains
        vm.selectFork(etherlinkFork);
        escrowFactoryEtherlink.setRelayerAuthorization(RELAYER, true);
        
        vm.selectFork(baseFork);
        escrowFactoryBase.setRelayerAuthorization(RELAYER, true);
    }

    function test_NewArchitectureFlow() public {
        console.log("\n=== Testing New V2 Architecture Flow ===");
        
        uint256 tokenAmount = 1000 * 10**6; // 1000 USDC
        uint256 startPrice = 1.1 ether;
        uint256 endPrice = 0.9 ether;
        uint256 duration = 1 hours;
        bytes32 auctionId = keccak256("test-auction-v2-001");
        
        // Step 1: User pre-approves tokens to EscrowFactory
        vm.selectFork(etherlinkFork);
        console.log("\n[Step 1] User pre-approves tokens");
        
        vm.startPrank(USER);
        tokenOnEtherlink.mint(USER, tokenAmount);
        tokenOnEtherlink.approve(address(escrowFactoryEtherlink), tokenAmount);
        escrowFactoryEtherlink.preApproveToken(address(tokenOnEtherlink), tokenAmount);
        vm.stopPrank();
        
        (bool approved, uint256 allowance) = escrowFactoryEtherlink.getUserApproval(USER, address(tokenOnEtherlink));
        assertTrue(approved, "User should have pre-approved");
        assertEq(allowance, tokenAmount, "Allowance should match");
        console.log("✓ User pre-approved %s USDC", tokenAmount / 10**6);
        
        // Step 2: Relayer posts auction WITHOUT creating escrow
        console.log("\n[Step 2] Relayer posts auction (no escrow created)");
        
        vm.prank(RELAYER);
        auctionEtherlink.createAuction(
            auctionId,
            address(tokenOnEtherlink),
            tokenAmount,
            startPrice,
            endPrice,
            duration
        );
        
        assertTrue(auctionEtherlink.isAuctionActive(auctionId), "Auction should be active");
        console.log("✓ Auction posted without escrow creation");
        
        // Step 3: Resolver wins auction by settling it
        console.log("\n[Step 3] Resolver competes and wins auction");
        
        vm.warp(block.timestamp + 30 minutes);
        uint256 currentPrice = auctionEtherlink.getCurrentPrice(auctionId);
        console.log("Current auction price: %s ETH", currentPrice / 10**18);
        
        vm.prank(RESOLVER);
        resolverContractEtherlink.winAuction{value: currentPrice}(auctionId);
        
        assertEq(resolverContractEtherlink.auctionWinner(auctionId), RESOLVER, "Resolver should be winner");
        console.log("✓ Resolver won auction at price: %s ETH", currentPrice / 10**18);
        
        // Step 4: Resolver creates escrows on BOTH chains with safety deposits
        console.log("\n[Step 4] Resolver creates escrows with safety deposits");
        
        // Give resolver tokens for the escrow
        vm.prank(USER);
        tokenOnEtherlink.mint(RESOLVER, tokenAmount);
        
        // Create escrow on Etherlink (source chain)
        vm.startPrank(RESOLVER);
        tokenOnEtherlink.approve(address(escrowEtherlink), tokenAmount);
        escrowEtherlink.createHTLC{value: SAFETY_DEPOSIT}(
            HASHLOCK,
            address(tokenOnEtherlink),
            tokenAmount,
            USER,
            block.timestamp + 2 hours
        );
        vm.stopPrank();
        console.log("✓ Source escrow created with %s ETH safety deposit", SAFETY_DEPOSIT / 10**18);
        
        // Create escrow on Base (destination chain)
        vm.selectFork(baseFork);
        vm.startPrank(USER);
        escrowBase.createHTLC{value: currentPrice + SAFETY_DEPOSIT}(
            HASHLOCK,
            address(0), // ETH
            currentPrice,
            RESOLVER,
            block.timestamp + 1 hours
        );
        vm.stopPrank();
        console.log("✓ Destination escrow created with %s ETH safety deposit", SAFETY_DEPOSIT / 10**18);
        
        // Step 5: Relayer moves user funds AFTER resolver commits
        vm.selectFork(etherlinkFork);
        console.log("\n[Step 5] Relayer moves user funds after resolver commitment");
        
        // In real implementation, relayer would verify escrows exist on both chains
        // For this test, we simulate the relayer moving funds
        vm.prank(RELAYER);
        uint256 userBalanceBefore = tokenOnEtherlink.balanceOf(USER);
        escrowFactoryEtherlink.moveUserFundsToEscrow(
            USER,
            address(tokenOnEtherlink),
            tokenAmount,
            address(escrowEtherlink)
        );
        
        assertEq(tokenOnEtherlink.balanceOf(USER), userBalanceBefore - tokenAmount, "User tokens should be moved");
        console.log("✓ Relayer moved user's %s USDC to escrow", tokenAmount / 10**6);
        
        // Step 6: User reveals secret after confirmations
        console.log("\n[Step 6] Secret reveal after confirmations");
        
        // Simulate waiting for confirmations
        vm.warp(block.timestamp + 10 minutes);
        console.log("✓ Waited for confirmations");
        
        // User withdraws on Base using secret
        vm.selectFork(baseFork);
        vm.startPrank(USER);
        uint256 userEthBefore = USER.balance;
        escrowBase.withdraw(SECRET, HASHLOCK);
        assertEq(USER.balance - userEthBefore, currentPrice + SAFETY_DEPOSIT, "User should receive payment");
        vm.stopPrank();
        console.log("✓ User revealed secret and received %s ETH", currentPrice / 10**18);
        
        // Resolver withdraws on Etherlink using revealed secret
        vm.selectFork(etherlinkFork);
        vm.startPrank(RESOLVER);
        uint256 resolverTokensBefore = tokenOnEtherlink.balanceOf(RESOLVER);
        escrowEtherlink.withdraw(SECRET, HASHLOCK);
        assertEq(
            tokenOnEtherlink.balanceOf(RESOLVER) - resolverTokensBefore,
            tokenAmount,
            "Resolver should receive tokens"
        );
        vm.stopPrank();
        console.log("✓ Resolver used secret to claim %s USDC", tokenAmount / 10**6);
        
        console.log("\n=== New V2 Flow Completed Successfully ===");
        console.log("Key differences from V1:");
        console.log("1. User pre-approved tokens (gasless after)");
        console.log("2. Auction posted without escrow");
        console.log("3. Resolver created escrows with safety deposits");
        console.log("4. Resolver has exclusive rights");
        console.log("5. Relayer moved funds after resolver commitment");
        console.log("6. Secret revealed after confirmations");
    }
    
    function test_ResolverExclusivity() public {
        console.log("\n=== Testing Resolver Exclusivity ===");
        
        uint256 tokenAmount = 500 * 10**6;
        bytes32 auctionId = keccak256("exclusivity-test");
        
        // Setup auction
        vm.selectFork(etherlinkFork);
        vm.prank(RELAYER);
        auctionEtherlink.createAuction(
            auctionId,
            address(tokenOnEtherlink),
            tokenAmount,
            1 ether,
            0.8 ether,
            1 hours
        );
        
        // Resolver 1 wins
        vm.prank(RESOLVER);
        resolverContractEtherlink.winAuction{value: 1 ether}(auctionId);
        
        // Another resolver tries to create escrow
        address RESOLVER2 = address(0x4444444444444444444444444444444444444444);
        vm.deal(RESOLVER2, 10 ether);
        
        // Should fail - not the winner
        vm.expectRevert(UniteResolverV2.NotAuctionWinner.selector);
        vm.prank(RESOLVER2);
        resolverContractEtherlink.createEscrowsAsResolver(
            auctionId,
            IBaseEscrow.Immutables(bytes32(0), bytes32(0), address(0), address(0), 0, 0, 0, 0, address(0)),
            IBaseEscrow.Immutables(bytes32(0), bytes32(0), address(0), address(0), 0, 0, 0, 0, address(0)),
            IOrderMixin.Order(0, address(0), address(0), address(0), address(0), address(0), 0, 0, 0),
            bytes32(0),
            bytes32(0),
            0,
            TakerTraits(0),
            "",
            0
        );
        
        console.log("✓ Only auction winner can create escrows");
        
        // Verify exclusive rights
        assertTrue(
            resolverContractEtherlink.hasExclusiveRights(auctionId, RESOLVER),
            "Winner should have exclusive rights"
        );
        assertFalse(
            resolverContractEtherlink.hasExclusiveRights(auctionId, RESOLVER2),
            "Non-winner should not have rights"
        );
        
        console.log("✓ Exclusive rights properly enforced");
    }
    
    function test_SafetyDepositMechanics() public {
        console.log("\n=== Testing Safety Deposit Mechanics ===");
        
        uint256 amount = 100 * 10**6;
        bytes32 hashlock = keccak256("safety-test");
        
        vm.selectFork(etherlinkFork);
        
        // Test 1: Creating escrow without safety deposit fails
        vm.startPrank(RESOLVER);
        tokenOnEtherlink.mint(RESOLVER, amount);
        tokenOnEtherlink.approve(address(escrowEtherlink), amount);
        
        vm.expectRevert("Safety deposit required");
        escrowEtherlink.createHTLC{value: 0}(
            hashlock,
            address(tokenOnEtherlink),
            amount,
            USER,
            block.timestamp + 1 hours
        );
        vm.stopPrank();
        console.log("✓ Escrow creation requires safety deposit");
        
        // Test 2: Safety deposit returned on successful completion
        vm.startPrank(RESOLVER);
        uint256 resolverEthBefore = RESOLVER.balance;
        escrowEtherlink.createHTLC{value: SAFETY_DEPOSIT}(
            hashlock,
            address(tokenOnEtherlink),
            amount,
            USER,
            block.timestamp + 1 hours
        );
        
        // Simulate withdrawal with secret
        bytes32 secret = "test-secret";
        bytes32 correctHashlock = keccak256(abi.encodePacked(secret));
        
        // Create new escrow with correct hashlock
        escrowEtherlink.createHTLC{value: SAFETY_DEPOSIT}(
            correctHashlock,
            address(tokenOnEtherlink),
            amount,
            USER,
            block.timestamp + 1 hours
        );
        vm.stopPrank();
        
        // User withdraws
        vm.prank(USER);
        escrowEtherlink.withdraw(secret, correctHashlock);
        
        // Check safety deposit was returned to receiver
        assertEq(USER.balance, SAFETY_DEPOSIT, "Safety deposit should be returned");
        console.log("✓ Safety deposit returned on successful withdrawal");
        
        // Test 3: Safety deposit returned on cancellation
        bytes32 cancelHashlock = keccak256("cancel-test");
        vm.startPrank(RESOLVER);
        escrowEtherlink.createHTLC{value: SAFETY_DEPOSIT}(
            cancelHashlock,
            address(tokenOnEtherlink),
            amount,
            USER,
            block.timestamp + 30 minutes
        );
        
        // Fast forward past timeout
        vm.warp(block.timestamp + 1 hours);
        
        uint256 resolverBalanceBefore = RESOLVER.balance;
        escrowEtherlink.cancel(cancelHashlock);
        assertEq(
            RESOLVER.balance - resolverBalanceBefore,
            SAFETY_DEPOSIT,
            "Safety deposit should be returned on cancel"
        );
        vm.stopPrank();
        
        console.log("✓ Safety deposit returned on cancellation");
    }
    
    function test_RelayerAuthorizationAndControl() public {
        console.log("\n=== Testing Relayer Authorization ===");
        
        vm.selectFork(etherlinkFork);
        
        // Test unauthorized relayer
        address UNAUTHORIZED = address(0x5555555555555555555555555555555555555555);
        
        vm.expectRevert(EnhancedEscrowFactory.UnauthorizedRelayer.selector);
        vm.prank(UNAUTHORIZED);
        escrowFactoryEtherlink.moveUserFundsToEscrow(
            USER,
            address(tokenOnEtherlink),
            100,
            address(escrowEtherlink)
        );
        
        console.log("✓ Unauthorized relayers cannot move funds");
        
        // Test authorization management
        vm.prank(address(this)); // owner
        escrowFactoryEtherlink.setRelayerAuthorization(UNAUTHORIZED, true);
        assertTrue(escrowFactoryEtherlink.authorizedRelayers(UNAUTHORIZED), "Should be authorized");
        
        vm.prank(address(this));
        escrowFactoryEtherlink.setRelayerAuthorization(UNAUTHORIZED, false);
        assertFalse(escrowFactoryEtherlink.authorizedRelayers(UNAUTHORIZED), "Should be deauthorized");
        
        console.log("✓ Relayer authorization properly managed");
    }
}

// Enhanced SimpleEscrow for V2 testing
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
        uint256 safetyDeposit;
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
        
        uint256 safetyDeposit = 0.001 ether;
        
        if (token == address(0)) {
            require(msg.value == amount + safetyDeposit, "Incorrect ETH amount");
        } else {
            require(msg.value == safetyDeposit, "Safety deposit required");
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
            cancelled: false,
            safetyDeposit: safetyDeposit
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
            payable(htlc.receiver).transfer(htlc.amount + htlc.safetyDeposit);
        } else {
            MockToken(htlc.token).transfer(htlc.receiver, htlc.amount);
            payable(htlc.receiver).transfer(htlc.safetyDeposit);
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
            payable(htlc.sender).transfer(htlc.amount + htlc.safetyDeposit);
        } else {
            MockToken(htlc.token).transfer(htlc.sender, htlc.amount);
            payable(htlc.sender).transfer(htlc.safetyDeposit);
        }
        
        emit HTLCCancelled(hashlock);
    }
}

// Mock types for testing
struct TakerTraits {
    uint256 value;
}

interface IOrderMixin {
    struct Order {
        uint256 salt;
        address makerAsset;
        address takerAsset;
        address maker;
        address receiver;
        address allowedSender;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 offsets;
    }
}

interface IBaseEscrow {
    struct Immutables {
        bytes32 orderHash;
        bytes32 hashlock;
        address srcToken;
        address dstToken;
        uint256 srcAmount;
        uint256 dstAmount;
        uint256 srcSafetyDeposit;
        uint256 dstSafetyDeposit;
        address taker;
    }
}