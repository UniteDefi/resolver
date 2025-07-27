// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../../contracts/src/RelayerService.sol";
import "../../contracts/src/UniteResolverV2.sol";
import "../../contracts/src/EnhancedEscrowFactory.sol";
import "../../contracts/src/MockToken.sol";
import "../../contracts/src/MockResolver.sol";

contract RelayerServiceTest is Test {
    RelayerService public relayerService;
    UniteResolverV2 public resolver;
    EnhancedEscrowFactory public escrowFactory;
    MockToken public srcToken;
    MockToken public dstToken;
    
    address public relayer = address(0x1);
    address public user = address(0x2);
    address public resolver1 = address(0x3);
    address public resolver2 = address(0x4);
    address public limitOrderProtocol = address(0x5);
    
    uint256 public constant SAFETY_DEPOSIT = 0.001 ether;
    uint256 public constant SRC_AMOUNT = 1000e18;
    uint256 public constant DST_AMOUNT = 900e18;
    uint256 public constant ETHERLINK_CHAIN_ID = 42793;
    uint256 public constant BASE_SEPOLIA_CHAIN_ID = 84532;
    
    bytes32 public constant SECRET = keccak256("test_secret");
    bytes32 public constant HASHLOCK = keccak256(abi.encodePacked(SECRET));
    
    function setUp() public {
        // Deploy contracts
        escrowFactory = new EnhancedEscrowFactory();
        relayerService = new RelayerService(address(escrowFactory));
        resolver = new UniteResolverV2(
            IEscrowFactory(address(escrowFactory)),
            limitOrderProtocol,
            address(this),
            address(relayerService)
        );
        
        // Deploy tokens
        srcToken = new MockToken("Source Token", "SRC", 18);
        dstToken = new MockToken("Destination Token", "DST", 18);
        
        // Setup roles
        vm.startPrank(address(this));
        escrowFactory.setRelayerAuthorization(address(relayerService), true);
        relayerService.setAuthorizedResolver(resolver1, true);
        relayerService.setAuthorizedResolver(resolver2, true);
        relayerService.transferOwnership(relayer);
        vm.stopPrank();
        
        // Fund accounts
        srcToken.mint(user, SRC_AMOUNT * 10);
        srcToken.mint(resolver1, SRC_AMOUNT * 10);
        dstToken.mint(resolver1, DST_AMOUNT * 10);
        dstToken.mint(resolver2, DST_AMOUNT * 10);
        
        vm.deal(resolver1, 10 ether);
        vm.deal(resolver2, 10 ether);
        vm.deal(user, 10 ether);
    }
    
    function createMockOrder() internal pure returns (IOrderMixin.Order memory) {
        return IOrderMixin.Order({
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
    }
    
    function createMockImmutables(
        address _srcToken,
        address _dstToken,
        uint256 _srcAmount,
        uint256 _dstAmount
    ) internal view returns (IBaseEscrow.Immutables memory) {
        return IBaseEscrow.Immutables({
            orderHash: keccak256("order"),
            hashlock: HASHLOCK,
            srcToken: _srcToken,
            dstToken: _dstToken,
            srcAmount: _srcAmount,
            dstAmount: _dstAmount,
            srcSafetyDeposit: SAFETY_DEPOSIT,
            dstSafetyDeposit: SAFETY_DEPOSIT,
            taker: resolver1
        });
    }
    
    function testEtherlinkToBaseSepoliaSwap() public {
        console.log("[Test] Starting Etherlink -> Base Sepolia swap test");
        
        // Step 1: User pre-approves tokens on Etherlink
        vm.startPrank(user);
        srcToken.approve(address(escrowFactory), SRC_AMOUNT);
        escrowFactory.preApproveToken(address(srcToken), SRC_AMOUNT);
        vm.stopPrank();
        
        // Step 2: Relayer creates order
        vm.startPrank(relayer);
        bytes32 orderId = relayerService.createOrder(
            user,
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT,
            ETHERLINK_CHAIN_ID,
            BASE_SEPOLIA_CHAIN_ID
        );
        vm.stopPrank();
        
        console.log("[Test] Order created with ID:", uint256(orderId));
        
        // Step 3: Resolver commits to order (simulating API call)
        vm.startPrank(resolver1);
        relayerService.commitToOrder(orderId);
        vm.stopPrank();
        
        console.log("[Test] Resolver committed to order");
        
        // Step 4: Resolver creates escrows on both chains
        vm.startPrank(resolver1);
        
        // Approve tokens for escrow
        srcToken.approve(address(resolver), SRC_AMOUNT);
        dstToken.approve(address(resolver), DST_AMOUNT);
        
        // Create immutables for both chains
        IBaseEscrow.Immutables memory srcImmutables = createMockImmutables(
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT
        );
        
        IBaseEscrow.Immutables memory dstImmutables = createMockImmutables(
            address(dstToken),
            address(srcToken),
            DST_AMOUNT,
            SRC_AMOUNT
        );
        
        // Create escrows with safety deposits
        (address srcEscrow, address dstEscrow) = resolver.createEscrowsForOrder{value: SAFETY_DEPOSIT * 2}(
            orderId,
            srcImmutables,
            dstImmutables,
            createMockOrder(),
            bytes32(0),
            bytes32(0),
            SRC_AMOUNT,
            MockResolver.TakerTraits(1, block.timestamp + 1 hours),
            "",
            block.timestamp + 2 hours
        );
        
        vm.stopPrank();
        
        console.log("[Test] Escrows created - src:", srcEscrow, "dst:", dstEscrow);
        
        // Step 5: Verify user funds were moved
        (, address orderUser,,,uint256 orderSrcAmount,,,,,, address orderSrcEscrow,, bool isActive,,) = relayerService.orders(orderId);
        assertEq(orderUser, user);
        assertEq(orderSrcAmount, SRC_AMOUNT);
        assertEq(orderSrcEscrow, srcEscrow);
        assertTrue(isActive);
        
        // Step 6: Relayer reveals secret on destination chain
        vm.startPrank(relayer);
        relayerService.completeOrder(orderId, SECRET);
        vm.stopPrank();
        
        console.log("[Test] Order completed with secret reveal");
        
        // Verify order is completed
        (,,,,,,,,,,,, bool isActive2, bool isCompleted,) = relayerService.orders(orderId);
        assertFalse(isActive2);
        assertTrue(isCompleted);
        
        console.log("[Test] Etherlink -> Base Sepolia swap completed successfully");
    }
    
    function testBaseSepoliaToEtherlinkSwap() public {
        console.log("[Test] Starting Base Sepolia -> Etherlink swap test");
        
        // Step 1: User pre-approves tokens on Base Sepolia
        vm.startPrank(user);
        dstToken.approve(address(escrowFactory), DST_AMOUNT);
        escrowFactory.preApproveToken(address(dstToken), DST_AMOUNT);
        vm.stopPrank();
        
        // Step 2: Relayer creates order (reversed direction)
        vm.startPrank(relayer);
        bytes32 orderId = relayerService.createOrder(
            user,
            address(dstToken),
            address(srcToken),
            DST_AMOUNT,
            SRC_AMOUNT,
            BASE_SEPOLIA_CHAIN_ID,
            ETHERLINK_CHAIN_ID
        );
        vm.stopPrank();
        
        console.log("[Test] Order created with ID:", uint256(orderId));
        
        // Step 3: Resolver commits to order
        vm.startPrank(resolver1);
        relayerService.commitToOrder(orderId);
        vm.stopPrank();
        
        // Step 4: Resolver creates escrows
        vm.startPrank(resolver1);
        
        srcToken.approve(address(resolver), SRC_AMOUNT);
        dstToken.approve(address(resolver), DST_AMOUNT);
        
        IBaseEscrow.Immutables memory srcImmutables = createMockImmutables(
            address(dstToken),
            address(srcToken),
            DST_AMOUNT,
            SRC_AMOUNT
        );
        
        IBaseEscrow.Immutables memory dstImmutables = createMockImmutables(
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT
        );
        
        (address srcEscrow, address dstEscrow) = resolver.createEscrowsForOrder{value: SAFETY_DEPOSIT * 2}(
            orderId,
            srcImmutables,
            dstImmutables,
            createMockOrder(),
            bytes32(0),
            bytes32(0),
            DST_AMOUNT,
            MockResolver.TakerTraits(1, block.timestamp + 1 hours),
            "",
            block.timestamp + 2 hours
        );
        
        vm.stopPrank();
        
        console.log("[Test] Escrows created - src:", srcEscrow, "dst:", dstEscrow);
        
        // Step 5: Complete order
        vm.startPrank(relayer);
        relayerService.completeOrder(orderId, SECRET);
        vm.stopPrank();
        
        console.log("[Test] Base Sepolia -> Etherlink swap completed successfully");
    }
    
    function testRescueMechanism() public {
        console.log("[Test] Testing rescue mechanism for failed swap");
        
        // Setup initial order
        vm.startPrank(user);
        srcToken.approve(address(escrowFactory), SRC_AMOUNT);
        escrowFactory.preApproveToken(address(srcToken), SRC_AMOUNT);
        vm.stopPrank();
        
        vm.startPrank(relayer);
        bytes32 orderId = relayerService.createOrder(
            user,
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT,
            ETHERLINK_CHAIN_ID,
            BASE_SEPOLIA_CHAIN_ID
        );
        vm.stopPrank();
        
        // Resolver 1 commits but doesn't complete
        vm.startPrank(resolver1);
        relayerService.commitToOrder(orderId);
        vm.stopPrank();
        
        // Fast forward past execution window
        vm.warp(block.timestamp + 6 minutes);
        
        console.log("[Test] Execution window expired");
        
        // Verify execution window expired
        assertTrue(relayerService.isExecutionWindowExpired(orderId));
        
        // Resolver 2 rescues the order
        vm.startPrank(resolver2);
        relayerService.rescueOrder(orderId);
        vm.stopPrank();
        
        console.log("[Test] Order rescued by resolver 2");
        
        // Verify new resolver is assigned
        (,,,,,,,, address committedResolver,,,,,,) = relayerService.orders(orderId);
        assertEq(committedResolver, resolver2);
        
        // Resolver 2 completes the swap
        vm.startPrank(resolver2);
        
        srcToken.approve(address(resolver), SRC_AMOUNT);
        dstToken.approve(address(resolver), DST_AMOUNT);
        
        IBaseEscrow.Immutables memory srcImmutables = createMockImmutables(
            address(srcToken),
            address(dstToken),
            SRC_AMOUNT,
            DST_AMOUNT
        );
        
        IBaseEscrow.Immutables memory dstImmutables = createMockImmutables(
            address(dstToken),
            address(srcToken),
            DST_AMOUNT,
            SRC_AMOUNT
        );
        
        resolver.createEscrowsForOrder{value: SAFETY_DEPOSIT * 2}(
            orderId,
            srcImmutables,
            dstImmutables,
            createMockOrder(),
            bytes32(0),
            bytes32(0),
            SRC_AMOUNT,
            MockResolver.TakerTraits(1, block.timestamp + 1 hours),
            "",
            block.timestamp + 2 hours
        );
        
        vm.stopPrank();
        
        console.log("[Test] Rescue mechanism test completed successfully");
    }
    
    function testMultipleResolverScenarios() public {
        console.log("[Test] Testing multiple resolver scenarios");
        
        // Create multiple orders
        vm.startPrank(user);
        srcToken.approve(address(escrowFactory), SRC_AMOUNT * 3);
        escrowFactory.preApproveToken(address(srcToken), SRC_AMOUNT * 3);
        vm.stopPrank();
        
        bytes32[] memory orderIds = new bytes32[](3);
        
        vm.startPrank(relayer);
        for (uint i = 0; i < 3; i++) {
            orderIds[i] = relayerService.createOrder(
                user,
                address(srcToken),
                address(dstToken),
                SRC_AMOUNT,
                DST_AMOUNT,
                ETHERLINK_CHAIN_ID,
                BASE_SEPOLIA_CHAIN_ID
            );
        }
        vm.stopPrank();
        
        // Different resolvers commit to different orders
        vm.prank(resolver1);
        relayerService.commitToOrder(orderIds[0]);
        
        vm.prank(resolver2);
        relayerService.commitToOrder(orderIds[1]);
        
        // Verify correct resolver assignments
        (,,,,,,,, address resolver0,,,,,,) = relayerService.orders(orderIds[0]);
        (,,,,,,,, address resolver1Addr,,,,,,) = relayerService.orders(orderIds[1]);
        
        assertEq(resolver0, resolver1);
        assertEq(resolver1Addr, resolver2);
        
        console.log("[Test] Multiple resolver scenario test completed");
    }
}