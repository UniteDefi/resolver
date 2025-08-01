// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ISimpleOrderProtocol.sol";
import "./libraries/SimpleOrderLib.sol";
import "./libraries/SignatureValidator.sol";
import "../interfaces/IOrderMixin.sol";

contract LimitOrderProtocol is ISimpleOrderProtocol, IOrderMixin, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SimpleOrderLib for ISimpleOrder.Order;

    string private constant SIGNING_DOMAIN = "LimitOrderProtocol";
    string private constant SIGNATURE_VERSION = "1";

    mapping(bytes32 => bool) public override invalidatedOrders;
    mapping(address => uint256) public override nonces;
    
    event Debug(string name, address addr);

    constructor() EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {}

    function fillOrder(
        ISimpleOrder.Order calldata order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) external payable override nonReentrant returns (
        uint256 actualMakingAmount,
        uint256 actualTakingAmount,
        bytes32 orderHash
    ) {
        return _fillOrderInternal(order, signature, makingAmount, takingAmount, target);
    }
    
    function _fillOrderInternal(
        ISimpleOrder.Order memory order,
        bytes memory signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) internal returns (
        uint256 actualMakingAmount,
        uint256 actualTakingAmount,
        bytes32 orderHash
    ) {
        // Validate order
        if (block.timestamp > order.deadline) revert ISimpleOrder.OrderExpired();
        if (order.nonce != nonces[order.maker]) revert ISimpleOrder.InvalidNonce();
        
        // Calculate order hash
        orderHash = this.hashOrder(order);
        
        // Check if order is already invalidated
        if (invalidatedOrders[orderHash]) revert ISimpleOrder.InvalidOrder();
        
        // Verify signature
        bytes32 digest = _hashTypedDataV4(orderHash);
        if (!SignatureValidator.isValidSignature(digest, signature, order.maker)) {
            revert ISimpleOrder.BadSignature();
        }
        
        // Calculate actual amounts (support partial fills)
        if (makingAmount == 0 && takingAmount == 0) {
            // For cross-chain swaps, when both amounts are 0, use full making amount
            // but keep taking amount as 0 since taker asset is on destination chain
            actualMakingAmount = order.makingAmount;
            actualTakingAmount = 0; // Always 0 for cross-chain swaps
        } else if (makingAmount > 0) {
            actualMakingAmount = makingAmount;
            actualTakingAmount = takingAmount; // Use the passed takingAmount (0 for cross-chain)
        } else {
            actualTakingAmount = takingAmount;
            actualMakingAmount = (takingAmount * order.makingAmount) / order.takingAmount;
        }
        
        // Validate amounts
        if (actualMakingAmount > order.makingAmount) {
            revert ISimpleOrder.InvalidAmount();
        }
        // For cross-chain swaps, actualTakingAmount can be 0 even if order.takingAmount > 0
        if (takingAmount > 0 && actualTakingAmount > order.takingAmount) {
            revert ISimpleOrder.InvalidAmount();
        }
        
        // Mark order as filled
        invalidatedOrders[orderHash] = true;
        nonces[order.maker]++;
        
        // Transfer tokens
        // From maker to target (or taker if target is zero)
        address recipient = target == address(0) ? msg.sender : target;
        
        // Emit debug event to see what's happening
        emit Debug("fillOrder target", target);
        emit Debug("fillOrder recipient", recipient);
        emit Debug("fillOrder msg.sender", msg.sender);
        
        IERC20(order.makerAsset).safeTransferFrom(order.maker, recipient, actualMakingAmount);
        
        // From taker to receiver (or maker if receiver is zero)
        // Skip taker asset transfer if actualTakingAmount is 0 (for cross-chain swaps)
        if (actualTakingAmount > 0) {
            address makerRecipient = order.receiver == address(0) ? order.maker : order.receiver;
            if (msg.value > 0 && order.takerAsset == address(0)) {
                // Native token payment
                if (msg.value < actualTakingAmount) revert ISimpleOrder.InvalidAmount();
                payable(makerRecipient).transfer(actualTakingAmount);
                // Refund excess
                if (msg.value > actualTakingAmount) {
                    payable(msg.sender).transfer(msg.value - actualTakingAmount);
                }
            } else {
                // ERC20 payment
                IERC20(order.takerAsset).safeTransferFrom(msg.sender, makerRecipient, actualTakingAmount);
            }
        }
        
        emit OrderFilled(orderHash, order.maker, msg.sender, actualMakingAmount, actualTakingAmount);
    }

    function cancelOrder(ISimpleOrder.Order calldata order) external override {
        if (msg.sender != order.maker) revert ISimpleOrder.InvalidOrder();
        
        bytes32 orderHash = hashOrder(order);
        if (invalidatedOrders[orderHash]) revert ISimpleOrder.InvalidOrder();
        
        invalidatedOrders[orderHash] = true;
        emit OrderCancelled(orderHash);
    }

    function hashOrder(ISimpleOrder.Order calldata order) public pure override returns (bytes32) {
        return keccak256(abi.encode(
            keccak256(
                "Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 deadline,uint256 nonce,uint256 srcChainId,uint256 dstChainId)"
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
            order.dstChainId
        ));
    }

    // Helper function to get the domain separator for external use
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    // Implement IOrderMixin interface
    function fillOrderArgs(
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args
    ) external payable override returns (uint256 makingAmount, uint256 takingAmount, bytes32 orderHash) {
        // Convert Order to ISimpleOrder.Order format
        ISimpleOrder.Order memory simpleOrder = ISimpleOrder.Order({
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
            dstChainId: order.dstChainId
        });

        // Reconstruct the signature from r and vs
        // Extract v and s from vs (v is in the highest bit, s is the rest)
        uint8 v = uint8((uint256(vs) >> 255) + 27);
        bytes32 s = bytes32(uint256(vs) << 1);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Extract target address from args if TakerTraits has target flag set
        address target = address(0);
        uint256 traitsValue = TakerTraits.unwrap(takerTraits);
        if ((traitsValue & (1 << 251)) != 0 && args.length >= 20) {
            // Target address is in the first 20 bytes of args
            assembly {
                target := shr(96, calldataload(add(args.offset, 0)))
            }
        }

        // Call the internal implementation
        return _fillOrderInternal(simpleOrder, signature, amount, 0, target);
    }

    // The hashOrder for IOrderMixin.Order is handled internally
    // by converting to ISimpleOrder.Order
}