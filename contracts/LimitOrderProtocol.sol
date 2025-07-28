// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

interface IEscrowFactory {
    function createEscrow(
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount,
        address maker,
        address taker,
        bytes32 hashlock,
        uint256 srcChainId,
        uint256 dstChainId,
        uint256 timelock,
        uint256 safetyDeposit
    ) external returns (address escrow);
}

contract LimitOrderProtocol {
    using ECDSA for bytes32;

    struct CrossChainOrder {
        address maker;
        address srcToken;
        address dstToken;
        uint256 srcAmount;
        uint256 dstAmount;
        uint256 srcChainId;
        uint256 dstChainId;
        bytes32 hashlock;
        uint256 timelock;
        uint256 safetyDeposit;
        uint256 nonce;
    }

    IEscrowFactory public immutable escrowFactory;
    mapping(bytes32 => bool) public filledOrders;
    mapping(address => uint256) public nonces;

    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        address srcEscrow
    );

    constructor(address _escrowFactory) {
        escrowFactory = IEscrowFactory(_escrowFactory);
    }

    function fillOrder(
        CrossChainOrder calldata order,
        bytes calldata signature,
        address taker
    ) external returns (address escrow) {
        // Verify order hash
        bytes32 orderHash = hashOrder(order);
        require(!filledOrders[orderHash], "Order already filled");
        
        // Verify signature
        address signer = orderHash.toEthSignedMessageHash().recover(signature);
        require(signer == order.maker, "Invalid signature");
        
        // Verify nonce
        require(order.nonce == nonces[order.maker], "Invalid nonce");
        
        // Mark order as filled
        filledOrders[orderHash] = true;
        nonces[order.maker]++;
        
        // Transfer tokens from maker to this contract
        IERC20(order.srcToken).transferFrom(order.maker, address(this), order.srcAmount);
        
        // Create escrow
        IERC20(order.srcToken).approve(address(escrowFactory), order.srcAmount);
        escrow = escrowFactory.createEscrow(
            order.srcToken,
            order.dstToken,
            order.srcAmount,
            order.dstAmount,
            order.maker,
            taker,
            order.hashlock,
            order.srcChainId,
            order.dstChainId,
            order.timelock,
            order.safetyDeposit
        );
        
        emit OrderFilled(orderHash, order.maker, taker, escrow);
    }

    function hashOrder(CrossChainOrder calldata order) public pure returns (bytes32) {
        return keccak256(abi.encode(
            order.maker,
            order.srcToken,
            order.dstToken,
            order.srcAmount,
            order.dstAmount,
            order.srcChainId,
            order.dstChainId,
            order.hashlock,
            order.timelock,
            order.safetyDeposit,
            order.nonce
        ));
    }
}