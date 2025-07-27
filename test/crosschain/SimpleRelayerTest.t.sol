// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../../contracts/src/RelayerService.sol";
import "../../contracts/src/UniteResolverV2.sol";
import "../../contracts/src/EnhancedEscrowFactory.sol";
import "../../contracts/src/MockToken.sol";

contract SimpleRelayerTest is Test {
    RelayerService public relayerService;
    UniteResolverV2 public resolver;
    EnhancedEscrowFactory public escrowFactory;
    MockToken public srcToken;
    MockToken public dstToken;
    
    address public relayer = address(0x1);
    address public user = address(0x2);
    address public resolver1 = address(0x3);
    
    uint256 public constant SAFETY_DEPOSIT = 0.001 ether;
    uint256 public constant SRC_AMOUNT = 1000e18;
    uint256 public constant DST_AMOUNT = 900e18;
    
    bytes32 public constant SECRET = keccak256("test_secret_123");
    bytes32 public constant HASHLOCK = keccak256(abi.encodePacked(SECRET));
    
    function setUp() public {
        console.log("\n=== SETUP PHASE ===");
        
        // Deploy contracts
        escrowFactory = new EnhancedEscrowFactory();
        relayerService = new RelayerService(address(escrowFactory));
        resolver = new UniteResolverV2(
            IEscrowFactory(address(escrowFactory)),
            address(0x5), // LOP
            address(this),
            address(relayerService)
        );
        
        // Deploy tokens
        srcToken = new MockToken("Source Token", "SRC", 18);
        dstToken = new MockToken("Destination Token", "DST", 18);
        
        // Setup roles
        escrowFactory.setRelayerAuthorization(address(relayerService), true);
        relayerService.setAuthorizedResolver(resolver1, true);
        relayerService.transferOwnership(relayer);
        
        // Fund accounts
        srcToken.mint(user, SRC_AMOUNT);
        srcToken.mint(resolver1, SRC_AMOUNT);
        dstToken.mint(resolver1, DST_AMOUNT);
        
        vm.deal(resolver1, 10 ether);
        
        console.log("Deployed Contracts:");
        console.log("- RelayerService:", address(relayerService));
        console.log("- UniteResolverV2:", address(resolver));
        console.log("- EscrowFactory:", address(escrowFactory));
        console.log("- SRC Token:", address(srcToken));
        console.log("- DST Token:", address(dstToken));
    }
    
    function testDetailedSwapFlow() public {
        console.log("\n=== DETAILED SWAP FLOW TEST ===");
        console.log("Secret:", uint256(SECRET));
        console.log("Hashlock:", uint256(HASHLOCK));
        
        // Step 1: User pre-approval
        console.log("\n[STEP 1] User Pre-Approval");
        vm.startPrank(user);
        uint256 userBalanceBefore = srcToken.balanceOf(user);
        console.log("User SRC balance before:", userBalanceBefore);
        
        srcToken.approve(address(escrowFactory), SRC_AMOUNT);
        uint256 allowance = srcToken.allowance(user, address(escrowFactory));
        console.log("User approved amount:", allowance);
        
        escrowFactory.preApproveToken(address(srcToken), SRC_AMOUNT);
        (bool approved, uint256 currentAllowance) = escrowFactory.getUserApproval(user, address(srcToken));
        console.log("Pre-approval status:", approved);
        console.log("Current allowance:", currentAllowance);
        vm.stopPrank();
        
        // Step 2: Create order
        console.log("\n[STEP 2] Order Creation");
        vm.startPrank(relayer);
        bytes32 orderId = relayerService.createOrder(
            user,
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT,
            42793, // Etherlink
            84532  // Base Sepolia
        );
        console.log("Order ID created:", uint256(orderId));
        
        // Get order details
        (
            bytes32 retrievedOrderId,
            address orderUser,
            address orderSrcToken,
            address orderDstToken,
            uint256 orderSrcAmount,
            uint256 orderDstAmount,
            uint256 srcChainId,
            uint256 dstChainId,
            address committedResolver,
            uint256 commitmentTime,
            address srcEscrow,
            address dstEscrow,
            bool isActive,
            bool isCompleted,
            bool isRescued
        ) = relayerService.orders(orderId);
        
        console.log("Order Details:");
        console.log("- User:", orderUser);
        console.log("- Source Token:", orderSrcToken);
        console.log("- Destination Token:", orderDstToken);
        console.log("- Source Amount:", orderSrcAmount);
        console.log("- Destination Amount:", orderDstAmount);
        console.log("- Source Chain ID:", srcChainId);
        console.log("- Destination Chain ID:", dstChainId);
        console.log("- Is Active:", isActive);
        vm.stopPrank();
        
        // Step 3: Resolver commits
        console.log("\n[STEP 3] Resolver Commitment");
        vm.startPrank(resolver1);
        uint256 timestampBefore = block.timestamp;
        relayerService.commitToOrder(orderId);
        
        (,,,,,,,, committedResolver, commitmentTime,,,,, ) = relayerService.orders(orderId);
        console.log("Committed Resolver:", committedResolver);
        console.log("Commitment Timestamp:", commitmentTime);
        console.log("Execution window expires at:", commitmentTime + 5 minutes);
        vm.stopPrank();
        
        // Step 4: Create escrows
        console.log("\n[STEP 4] Escrow Creation");
        vm.startPrank(resolver1);
        
        // Approve tokens
        srcToken.approve(address(resolver), SRC_AMOUNT);
        dstToken.approve(address(resolver), DST_AMOUNT);
        
        // Create immutables
        IBaseEscrow.Immutables memory srcImmutables = IBaseEscrow.Immutables({
            orderHash: keccak256("order"),
            hashlock: HASHLOCK,
            srcToken: address(srcToken),
            dstToken: address(dstToken),
            srcAmount: SRC_AMOUNT,
            dstAmount: DST_AMOUNT,
            srcSafetyDeposit: SAFETY_DEPOSIT,
            dstSafetyDeposit: SAFETY_DEPOSIT,
            taker: resolver1
        });
        
        IBaseEscrow.Immutables memory dstImmutables = IBaseEscrow.Immutables({
            orderHash: keccak256("order"),
            hashlock: HASHLOCK,
            srcToken: address(dstToken),
            dstToken: address(srcToken),
            srcAmount: DST_AMOUNT,
            dstAmount: SRC_AMOUNT,
            srcSafetyDeposit: SAFETY_DEPOSIT,
            dstSafetyDeposit: SAFETY_DEPOSIT,
            taker: resolver1
        });
        
        // Track balances
        uint256 resolverSrcBefore = srcToken.balanceOf(resolver1);
        uint256 resolverDstBefore = dstToken.balanceOf(resolver1);
        uint256 resolverEthBefore = resolver1.balance;
        
        console.log("Resolver balances before escrow creation:");
        console.log("- SRC tokens:", resolverSrcBefore);
        console.log("- DST tokens:", resolverDstBefore);
        console.log("- ETH:", resolverEthBefore);
        
        // Create mock order
        IOrderMixin.Order memory order = IOrderMixin.Order({
            salt: 1,
            makerAsset: address(0),
            takerAsset: address(0),
            maker: address(0),
            receiver: address(0),
            allowedSender: address(0),
            makingAmount: 0,
            takingAmount: 0,
            offsets: 0
        });
        
        (address createdSrcEscrow, address createdDstEscrow) = resolver.createEscrowsForOrder{value: SAFETY_DEPOSIT * 2}(
            orderId,
            srcImmutables,
            dstImmutables,
            order,
            bytes32(0),
            bytes32(0),
            SRC_AMOUNT,
            MockResolver.TakerTraits(1, block.timestamp + 1 hours),
            "",
            block.timestamp + 2 hours
        );
        
        console.log("\nEscrows created:");
        console.log("- Source Escrow:", createdSrcEscrow);
        console.log("- Destination Escrow:", createdDstEscrow);
        
        // Check user funds were moved
        uint256 userBalanceAfter = srcToken.balanceOf(user);
        console.log("\nUser funds movement:");
        console.log("- User SRC before:", userBalanceBefore);
        console.log("- User SRC after:", userBalanceAfter);
        console.log("- Amount moved:", userBalanceBefore - userBalanceAfter);
        
        vm.stopPrank();
        
        // Step 5: Complete order
        console.log("\n[STEP 5] Order Completion");
        vm.startPrank(relayer);
        
        relayerService.completeOrder(orderId, SECRET);
        
        (,,,,,,,,,, srcEscrow, dstEscrow, isActive, isCompleted, isRescued) = relayerService.orders(orderId);
        console.log("Order completion status:");
        console.log("- Is Active:", isActive);
        console.log("- Is Completed:", isCompleted);
        console.log("- Is Rescued:", isRescued);
        console.log("- Secret revealed:", uint256(SECRET));
        
        vm.stopPrank();
        
        console.log("\n=== SWAP COMPLETED SUCCESSFULLY ===");
    }
}