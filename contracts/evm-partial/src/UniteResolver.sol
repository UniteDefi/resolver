// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IOrderMixin.sol";
import "./interfaces/IEscrowFactory.sol";
import "./interfaces/IBaseEscrow.sol";
import "./interfaces/IEscrow.sol";
import "./libraries/TimelocksLib.sol";
import "./libraries/ImmutablesLib.sol";
import "./interfaces/IUniteOrderProtocol.sol";
import "./interfaces/IUniteOrder.sol";

contract UniteResolver is Ownable {
    using SafeERC20 for IERC20;
    using ImmutablesLib for IBaseEscrow.Immutables;
    using TimelocksLib for uint256;

    error InvalidLength();
    error LengthMismatch();
    error TransferFailed();

    IEscrowFactory private immutable _FACTORY;
    IOrderMixin private immutable _LOP;
    IUniteOrderProtocol private immutable _SOP;

    event SrcEscrowDeployed(address indexed escrow, bytes32 indexed orderHash);
    event DstEscrowDeployed(address indexed escrow, bytes32 indexed orderHash);
    event Debug(string message, address addr);
    event PartialFillExecuted(address indexed escrow, bytes32 indexed orderHash, uint256 partialAmount);

    constructor(IEscrowFactory factory, IOrderMixin lop, address initialOwner) Ownable(initialOwner) {
        _FACTORY = factory;
        _LOP = lop;
        _SOP = IUniteOrderProtocol(address(lop)); // Same contract, different interface
    }

    receive() external payable {}
    
    // Helper function to convert IOrderMixin.Order to IUniteOrder.Order
    function _convertOrder(IOrderMixin.Order calldata order) internal pure returns (IUniteOrder.Order memory) {
        return IUniteOrder.Order({
            salt: order.salt,
            maker: order.maker,
            receiver: order.receiver,
            makerAsset: order.makerAsset,
            takerAsset: order.takerAsset,
            makingAmount: order.makingAmount,
            takingAmount: order.takingAmount,
            deadline: order.deadline,
            nonce: order.nonce,
            srcChainId: order.srcChainId,
            dstChainId: order.dstChainId,
            auctionStartTime: order.auctionStartTime,
            auctionEndTime: order.auctionEndTime,
            startPrice: order.startPrice,
            endPrice: order.endPrice
        });
    }

    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount
    ) external payable onlyOwner {
        _deploySrcWithSignature(immutables, order, signature, amount);
    }
    
    function deploySrcCompact(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount
    ) external payable onlyOwner {
        _deploySrcCompactPartial(immutables, order, r, vs, amount, amount);
    }
    
    function deploySrcCompactPartial(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        uint256 partialAmount
    ) external payable {
        _deploySrcCompactPartial(immutables, order, r, vs, amount, partialAmount);
    }
    
    function _deploySrcCompactPartial(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        uint256 partialAmount
    ) internal {
        // Add debug event
        emit Debug("deploySrcCompact called", msg.sender);
        
        // Check if this is the first fill for this order
        IUniteOrder.Order memory simpleOrder = _convertOrder(order);
        bytes32 orderHash = _SOP.hashOrder(simpleOrder);
        
        emit Debug("Order hash calculated", address(uint160(uint256(orderHash))));
        
        address existingEscrowAddress = _LOP.getEscrowAddress(orderHash);
        emit Debug("Existing escrow address", existingEscrowAddress);
        
        address escrowAddress;
        if (existingEscrowAddress == address(0)) {
            // First resolver - create escrow and it will be stored in LimitOrderProtocol
            escrowAddress = _FACTORY.createSrcEscrowPartialFor{value: msg.value}(immutables, partialAmount, msg.sender);
            require(escrowAddress != address(0), "Invalid escrow address");
            emit Debug("Created new escrow", escrowAddress);
        } else {
            // Subsequent resolvers - use existing escrow and add to it
            escrowAddress = existingEscrowAddress;
            // Still need to register this resolver with the factory
            address returnedAddress = _FACTORY.createSrcEscrowPartialFor{value: msg.value}(immutables, partialAmount, msg.sender);
            require(returnedAddress == escrowAddress, "Escrow address mismatch");
            emit Debug("Using existing escrow", escrowAddress);
        }

        // Set TakerTraits with target flag (bit 251)
        IOrderMixin.TakerTraits takerTraits = IOrderMixin.TakerTraits.wrap(uint256(1 << 251));
        
        // Encode escrow address as target in args (first 20 bytes, no padding)
        bytes memory args = abi.encodePacked(escrowAddress);
        
        emit Debug("About to call fillOrderArgs", escrowAddress);
        
        // Fill the order with partial amount, which will transfer tokens to escrow
        // The LimitOrderProtocol will now handle partial fills and ensure consistency
        _LOP.fillOrderArgs(order, r, vs, partialAmount, takerTraits, args);

        emit SrcEscrowDeployed(escrowAddress, immutables.orderHash);
        emit PartialFillExecuted(escrowAddress, immutables.orderHash, partialAmount);
    }
    
    function _deploySrcWithSignature(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount
    ) internal {
        require(signature.length == 64 || signature.length == 65, "Invalid signature length");
        
        // Extract r and vs from signature
        bytes32 r;
        bytes32 vs;
        
        if (signature.length == 65) {
            // Standard signature format (r, s, v)
            uint8 v;
            bytes32 s;
            r = bytes32(signature[0:32]);
            s = bytes32(signature[32:64]);
            v = uint8(signature[64]);
            // Convert to compact format
            vs = bytes32(uint256(v - 27) << 255 | uint256(s >> 1));
        } else {
            // Compact format (r, vs)
            assembly {
                r := calldataload(add(signature.offset, 0))
                vs := calldataload(add(signature.offset, 32))
            }
        }

        // Update immutables with deployment timestamp
        IBaseEscrow.Immutables memory immutablesMem = immutables;
        immutablesMem.timelocks = immutablesMem.timelocks.setDeployedAt(block.timestamp);
        
        // Calculate escrow address
        address escrowAddress = _FACTORY.addressOfEscrowSrc(immutablesMem);
        require(escrowAddress != address(0), "Invalid escrow address");

        // Send safety deposit to escrow address
        (bool success,) = escrowAddress.call{value: msg.value}("");
        if (!success) revert TransferFailed();

        // Set TakerTraits with target flag (bit 251)
        IOrderMixin.TakerTraits takerTraits = IOrderMixin.TakerTraits.wrap(uint256(1 << 251));
        
        // Encode escrow address as target in args (first 20 bytes, no padding)
        bytes memory args = abi.encodePacked(escrowAddress);
        
        // Fill the order, which will transfer tokens to escrow
        _LOP.fillOrderArgs(order, r, vs, amount, takerTraits, args);

        emit SrcEscrowDeployed(escrowAddress, immutables.orderHash);
    }

    function deployDst(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp
    ) external payable onlyOwner {
        _deployDstPartial(immutables, srcCancellationTimestamp, immutables.amount);
    }
    
    function deployDstPartial(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp,
        uint256 partialAmount
    ) external payable {
        _deployDstPartial(immutables, srcCancellationTimestamp, partialAmount);
    }
    
    function _deployDstPartial(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp,
        uint256 partialAmount
    ) internal {
        // Deploy destination escrow with safety deposit (partial amount)
        address escrowAddress = _FACTORY.createDstEscrowPartialFor{value: msg.value}(immutables, srcCancellationTimestamp, partialAmount, msg.sender);
        
        // Transfer destination tokens to escrow (partial amount)
        address token = address(uint160(immutables.token));
        
        IERC20(token).safeTransferFrom(msg.sender, escrowAddress, partialAmount);
        
        emit DstEscrowDeployed(escrowAddress, immutables.orderHash);
        emit PartialFillExecuted(escrowAddress, immutables.orderHash, partialAmount);
    }

    function withdraw(IEscrow escrow, bytes32 secret, IBaseEscrow.Immutables calldata immutables) external {
        escrow.withdraw(secret, immutables);
    }
    
    function withdrawUser(IEscrow escrow, bytes32 secret, IBaseEscrow.Immutables calldata immutables) external {
        escrow.withdrawUser(secret, immutables);
    }
    
    function withdrawResolver(IEscrow escrow, bytes32 secret, IBaseEscrow.Immutables calldata immutables) external {
        escrow.withdrawResolver(secret, immutables);
    }

    function cancel(IEscrow escrow, IBaseEscrow.Immutables calldata immutables) external {
        escrow.cancel(immutables);
    }

    function arbitraryCalls(address[] calldata targets, bytes[] calldata arguments) external onlyOwner {
        uint256 length = targets.length;
        if (targets.length != arguments.length) revert LengthMismatch();
        for (uint256 i = 0; i < length; ++i) {
            (bool success, bytes memory result) = targets[i].call(arguments[i]);
            if (!success) {
                // Forward the revert reason
                if (result.length > 0) {
                    assembly {
                        let size := mload(result)
                        revert(add(32, result), size)
                    }
                } else {
                    revert("Call failed");
                }
            }
        }
    }
}