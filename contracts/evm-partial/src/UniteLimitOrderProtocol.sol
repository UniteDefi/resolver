// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./interfaces/IUniteOrderProtocol.sol";
import "./libraries/UniteOrderLib.sol";
import "./libraries/UniteSignatureValidator.sol";
import "./libraries/DutchAuctionLib.sol";
import "./interfaces/IOrderMixin.sol";

contract UniteLimitOrderProtocol is IUniteOrderProtocol, IOrderMixin, EIP712, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using UniteOrderLib for IUniteOrder.Order;

    string private constant SIGNING_DOMAIN = "UniteLimitOrderProtocol";
    string private constant SIGNATURE_VERSION = "1";

    mapping(bytes32 => bool) public override invalidatedOrders;
    mapping(address => uint256) public override nonces;
    
    // Partial fill support
    mapping(bytes32 => uint256) public filledAmounts; // orderHash => total filled amount
    mapping(bytes32 => address) public escrowAddresses; // orderHash => escrow address for the order
    
    event Debug(string name, address addr);

    constructor() EIP712(SIGNING_DOMAIN, SIGNATURE_VERSION) {}

    function fillOrder(
        IUniteOrder.Order calldata order,
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
        IUniteOrder.Order memory order,
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
        if (block.timestamp > order.deadline) revert IUniteOrder.OrderExpired();
        if (order.nonce != nonces[order.maker]) revert IUniteOrder.InvalidNonce();
        
        // Calculate order hash
        orderHash = hashOrder(order);
        
        // Check if order is already invalidated
        if (invalidatedOrders[orderHash]) revert IUniteOrder.InvalidOrder();
        
        // Verify signature
        bytes32 digest = _hashTypedDataV4(orderHash);
        if (!UniteSignatureValidator.isValidSignature(digest, signature, order.maker)) {
            revert IUniteOrder.BadSignature();
        }
        
        // Check remaining available amount
        uint256 alreadyFilled = filledAmounts[orderHash];
        uint256 remainingAmount = order.makingAmount - alreadyFilled;
        
        if (remainingAmount == 0) {
            revert IUniteOrder.InvalidOrder(); // Order already fully filled
        }
        
        // Calculate actual amounts based on Dutch auction pricing
        if (makingAmount == 0 && takingAmount == 0) {
            // For cross-chain swaps, when both amounts are 0, use remaining amount
            actualMakingAmount = remainingAmount;
            // Calculate taking amount based on current Dutch auction price
            actualTakingAmount = DutchAuctionLib.calculateTakingAmount(
                actualMakingAmount,
                order.startPrice,
                order.endPrice,
                order.auctionStartTime,
                order.auctionEndTime,
                block.timestamp
            );
        } else if (makingAmount > 0) {
            actualMakingAmount = makingAmount;
            // Calculate taking amount based on current Dutch auction price
            actualTakingAmount = DutchAuctionLib.calculateTakingAmount(
                actualMakingAmount,
                order.startPrice,
                order.endPrice,
                order.auctionStartTime,
                order.auctionEndTime,
                block.timestamp
            );
        } else {
            // If taking amount is specified, calculate making amount based on current price
            uint256 currentPrice = DutchAuctionLib.getCurrentPrice(
                order.startPrice,
                order.endPrice,
                order.auctionStartTime,
                order.auctionEndTime,
                block.timestamp
            );
            actualTakingAmount = takingAmount;
            actualMakingAmount = (takingAmount * 1e18) / currentPrice;
        }
        
        // Validate amounts don't exceed remaining
        if (actualMakingAmount > remainingAmount) {
            revert IUniteOrder.InvalidAmount();
        }
        // For cross-chain swaps, actualTakingAmount can be 0 even if order.takingAmount > 0
        if (takingAmount > 0 && actualTakingAmount > order.takingAmount) {
            revert IUniteOrder.InvalidAmount();
        }
        
        // Update filled amounts
        filledAmounts[orderHash] += actualMakingAmount;
        
        // Only mark order as fully filled and increment nonce when completely consumed
        if (filledAmounts[orderHash] >= order.makingAmount) {
            invalidatedOrders[orderHash] = true;
            nonces[order.maker]++;
        }
        
        // Handle escrow address for consistent routing
        address recipient = target == address(0) ? msg.sender : target;
        
        // For the first fill, store the escrow address
        if (escrowAddresses[orderHash] == address(0)) {
            escrowAddresses[orderHash] = recipient;
        } else {
            // For subsequent fills, ensure all funds go to the same escrow
            recipient = escrowAddresses[orderHash];
        }
        
        // Emit debug event to see what's happening
        emit Debug("fillOrder target", target);
        emit Debug("fillOrder recipient", recipient);
        emit Debug("fillOrder msg.sender", msg.sender);
        
        // For cross-chain orders, don't transfer tokens immediately
        // The tokens will be transferred later by the escrow factory
        bool isCrossChain = order.srcChainId != order.dstChainId || order.srcChainId != block.chainid;
        if (!isCrossChain) {
            // Regular same-chain order - transfer immediately
            IERC20(order.makerAsset).safeTransferFrom(order.maker, recipient, actualMakingAmount);
        }
        // For cross-chain orders, just record the commitment - no transfer yet
        
        // From taker to receiver (or maker if receiver is zero)
        // Skip taker asset transfer for cross-chain swaps (different chain IDs)
        if (actualTakingAmount > 0 && !isCrossChain) {
            address makerRecipient = order.receiver == address(0) ? order.maker : order.receiver;
            if (msg.value > 0 && order.takerAsset == address(0)) {
                // Native token payment
                if (msg.value < actualTakingAmount) revert IUniteOrder.InvalidAmount();
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
    
    // View functions for partial fill support
    function getFilledAmount(bytes32 orderHash) external view returns (uint256) {
        return filledAmounts[orderHash];
    }
    
    function getRemainingAmount(IUniteOrder.Order memory order) external view returns (uint256) {
        bytes32 orderHash = hashOrder(order);
        uint256 filled = filledAmounts[orderHash];
        return order.makingAmount > filled ? order.makingAmount - filled : 0;
    }
    
    // Implement IOrderMixin interface getRemainingAmountByOrder
    function getRemainingAmountByOrder(IOrderMixin.Order memory order) external view returns (uint256) {
        // Convert to IUniteOrder.Order and calculate
        IUniteOrder.Order memory simpleOrder = IUniteOrder.Order({
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
        
        bytes32 orderHash = hashOrder(simpleOrder);
        uint256 filled = filledAmounts[orderHash];
        return order.makingAmount > filled ? order.makingAmount - filled : 0;
    }
    
    
    function getEscrowAddress(bytes32 orderHash) external view returns (address) {
        return escrowAddresses[orderHash];
    }
    
    function isOrderFullyFilled(bytes32 orderHash) external view returns (bool) {
        return invalidatedOrders[orderHash];
    }

    function cancelOrder(IUniteOrder.Order memory order) external override {
        if (msg.sender != order.maker) revert IUniteOrder.InvalidOrder();
        
        bytes32 orderHash = hashOrder(order);
        if (invalidatedOrders[orderHash]) revert IUniteOrder.InvalidOrder();
        
        invalidatedOrders[orderHash] = true;
        emit OrderCancelled(orderHash);
    }

    function hashOrder(IUniteOrder.Order memory order) public pure override returns (bytes32) {
        return keccak256(abi.encode(
            keccak256(
                "Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 deadline,uint256 nonce,uint256 srcChainId,uint256 dstChainId,uint256 auctionStartTime,uint256 auctionEndTime,uint256 startPrice,uint256 endPrice)"
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
            order.dstChainId,
            order.auctionStartTime,
            order.auctionEndTime,
            order.startPrice,
            order.endPrice
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
        // Convert Order to IUniteOrder.Order format
        IUniteOrder.Order memory simpleOrder = IUniteOrder.Order({
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

        // Reconstruct the signature from r and vs
        // Extract v and s from vs (v is in the highest bit, s is the rest)
        uint8 v = uint8((uint256(vs) >> 255) + 27);
        bytes32 s = bytes32(uint256(vs) & 0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff);
        bytes memory signature = abi.encodePacked(r, s, v);

        // Extract target address from args if TakerTraits has target flag set
        address target = address(0);
        uint256 traitsValue = TakerTraits.unwrap(takerTraits);
        if ((traitsValue & (1 << 251)) != 0 && args.length >= 20) {
            // Target address is in the first 20 bytes of args
            // Since args is calldata, we can extract the address directly
            assembly {
                target := shr(96, calldataload(args.offset))
            }
        }

        // Call the internal implementation
        return _fillOrderInternal(simpleOrder, signature, amount, 0, target);
    }

    // Update fill tracking for destination-side fills (called by UniteResolver)
    function updateFillAmount(IOrderMixin.Order calldata order, uint256 fillAmount) external {
        // Convert to simple order format
        IUniteOrder.Order memory simpleOrder = IUniteOrder.Order({
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
        
        bytes32 orderHash = hashOrder(simpleOrder);
        
        // Update filled amounts
        filledAmounts[orderHash] += fillAmount;
        
        // Mark order as fully filled if completely consumed
        if (filledAmounts[orderHash] >= order.makingAmount) {
            invalidatedOrders[orderHash] = true;
            nonces[order.maker]++;
        }
    }

    // The hashOrder for IOrderMixin.Order is handled internally
    // by converting to IUniteOrder.Order
}