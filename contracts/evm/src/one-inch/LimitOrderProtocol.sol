// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/ISimpleOrderProtocol.sol";
import "./libraries/SimpleOrderLib.sol";
import "./libraries/SignatureValidator.sol";

contract LimitOrderProtocol is ISimpleOrderProtocol, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using SimpleOrderLib for ISimpleOrder.Order;

    string private constant SIGNING_DOMAIN = "LimitOrderProtocol";
    string private constant SIGNATURE_VERSION = "1";

    mapping(bytes32 => bool) public override invalidatedOrders;
    mapping(address => uint256) public override nonces;

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
        // Validate order
        if (block.timestamp > order.deadline) revert ISimpleOrder.OrderExpired();
        if (order.nonce != nonces[order.maker]) revert ISimpleOrder.InvalidNonce();
        
        // Calculate order hash
        orderHash = hashOrder(order);
        
        // Check if order is already invalidated
        if (invalidatedOrders[orderHash]) revert ISimpleOrder.InvalidOrder();
        
        // Verify signature
        bytes32 digest = _hashTypedDataV4(order.hash());
        if (!SignatureValidator.isValidSignature(digest, signature, order.maker)) {
            revert ISimpleOrder.BadSignature();
        }
        
        // Calculate actual amounts (support partial fills)
        if (makingAmount == 0 && takingAmount == 0) {
            actualMakingAmount = order.makingAmount;
            actualTakingAmount = order.takingAmount;
        } else if (makingAmount > 0) {
            actualMakingAmount = makingAmount;
            actualTakingAmount = (makingAmount * order.takingAmount) / order.makingAmount;
        } else {
            actualTakingAmount = takingAmount;
            actualMakingAmount = (takingAmount * order.makingAmount) / order.takingAmount;
        }
        
        // Validate amounts
        if (actualMakingAmount > order.makingAmount || actualTakingAmount > order.takingAmount) {
            revert ISimpleOrder.InvalidAmount();
        }
        
        // Mark order as filled
        invalidatedOrders[orderHash] = true;
        nonces[order.maker]++;
        
        // Transfer tokens
        // From maker to target (or taker if target is zero)
        address recipient = target == address(0) ? msg.sender : target;
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
        return order.hash();
    }

    // Helper function to get the domain separator for external use
    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }
}