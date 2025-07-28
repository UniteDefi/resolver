// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../contracts/src/RelayerService.sol";
import "../contracts/src/UniteResolverV2.sol";
import "../contracts/src/EnhancedEscrowFactory.sol";
import "../contracts/src/MockToken.sol";

contract TestCrosschainSwap is Script {
    
    struct DeploymentInfo {
        address escrowFactory;
        address relayerService;
        address resolver;
        address srcToken;
        address dstToken;
    }
    
    function run() external {
        uint256 privateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(privateKey);
        
        console.log("Testing crosschain swap with address:", deployer);
        console.log("Chain ID:", block.chainid);
        
        // Load deployment addresses
        DeploymentInfo memory info = loadDeploymentInfo();
        
        vm.startBroadcast(privateKey);
        
        // Initialize contracts
        RelayerService relayerService = RelayerService(info.relayerService);
        UniteResolverV2 resolver = UniteResolverV2(info.resolver);
        EnhancedEscrowFactory escrowFactory = EnhancedEscrowFactory(info.escrowFactory);
        MockToken srcToken = MockToken(info.srcToken);
        MockToken dstToken = MockToken(info.dstToken);
        
        // Test parameters
        uint256 srcAmount = 1000e18;
        uint256 dstAmount = 900e18;
        bytes32 secret = keccak256("live_test_secret");
        bytes32 hashlock = keccak256(abi.encodePacked(secret));
        
        console.log("Test Secret:", uint256(secret));
        console.log("Test Hashlock:", uint256(hashlock));
        
        // Step 1: Mint tokens for testing
        srcToken.mint(deployer, srcAmount * 2);
        dstToken.mint(deployer, dstAmount * 2);
        console.log("Minted test tokens");
        
        // Step 2: User pre-approval (deployer acts as user)
        srcToken.approve(address(escrowFactory), srcAmount);
        escrowFactory.preApproveToken(address(srcToken), srcAmount);
        console.log("User pre-approved tokens");
        
        // Step 3: Create order
        bytes32 orderId = relayerService.createOrder(
            deployer, // user
            address(srcToken),
            address(dstToken),
            srcAmount,
            dstAmount,
            block.chainid == 128123 ? 128123 : 84532, // source chain
            block.chainid == 128123 ? 84532 : 128123   // destination chain
        );
        console.log("Order created with ID:", uint256(orderId));
        
        // Step 4: Resolver commits
        relayerService.commitToOrder(orderId);
        console.log("Resolver committed to order");
        
        // Step 5: Create escrows
        srcToken.approve(address(resolver), srcAmount);
        dstToken.approve(address(resolver), dstAmount);
        
        // Create immutables
        IBaseEscrow.Immutables memory srcImmutables = IBaseEscrow.Immutables({
            orderHash: keccak256("live_order"),
            hashlock: hashlock,
            srcToken: address(srcToken),
            dstToken: address(dstToken),
            srcAmount: srcAmount,
            dstAmount: dstAmount,
            srcSafetyDeposit: 0.001 ether,
            dstSafetyDeposit: 0.001 ether,
            taker: deployer
        });
        
        IBaseEscrow.Immutables memory dstImmutables = IBaseEscrow.Immutables({
            orderHash: keccak256("live_order"),
            hashlock: hashlock,
            srcToken: address(dstToken),
            dstToken: address(srcToken),
            srcAmount: dstAmount,
            dstAmount: srcAmount,
            srcSafetyDeposit: 0.001 ether,
            dstSafetyDeposit: 0.001 ether,
            taker: deployer
        });
        
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
        
        uint256 balanceBefore = deployer.balance;
        console.log("Balance before escrow creation:", balanceBefore);
        
        (address srcEscrow, address dstEscrow) = resolver.createEscrowsForOrder{value: 0.002 ether}(
            orderId,
            srcImmutables,
            dstImmutables,
            order,
            bytes32(0),
            bytes32(0),
            srcAmount,
            MockResolver.TakerTraits(1, block.timestamp + 1 hours),
            "",
            block.timestamp + 2 hours
        );
        
        console.log("Escrows created:");
        console.log("- Source escrow:", srcEscrow);
        console.log("- Destination escrow:", dstEscrow);
        console.log("- ETH spent on safety deposits:", balanceBefore - deployer.balance);
        
        // Step 6: Complete order (reveal secret)
        relayerService.completeOrder(orderId, secret);
        console.log("Order completed with secret reveal");
        
        // Step 7: Resolver withdraws
        resolver.withdrawFromSourceEscrow(orderId, secret);
        console.log("Resolver withdrew from source escrow");
        
        // Log final state
        (,,,,,,,,,, address finalSrcEscrow, address finalDstEscrow, bool isActive, bool isCompleted, bool isRescued) = relayerService.orders(orderId);
        console.log("Final order state:");
        console.log("- Active:", isActive);
        console.log("- Completed:", isCompleted);
        console.log("- Rescued:", isRescued);
        console.log("- Source escrow:", finalSrcEscrow);
        console.log("- Destination escrow:", finalDstEscrow);
        
        vm.stopBroadcast();
        
        console.log("=== CROSSCHAIN SWAP TEST COMPLETED ===");
    }
    
    function loadDeploymentInfo() internal view returns (DeploymentInfo memory) {
        string memory filename = string.concat("deployments_", vm.toString(block.chainid), ".json");
        string memory json = vm.readFile(filename);
        
        return DeploymentInfo({
            escrowFactory: vm.parseJsonAddress(json, ".escrowFactory"),
            relayerService: vm.parseJsonAddress(json, ".relayerService"),
            resolver: vm.parseJsonAddress(json, ".resolver"),
            srcToken: vm.parseJsonAddress(json, ".srcToken"),
            dstToken: vm.parseJsonAddress(json, ".dstToken")
        });
    }
}