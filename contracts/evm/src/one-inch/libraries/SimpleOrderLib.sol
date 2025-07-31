// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/ISimpleOrder.sol";

library SimpleOrderLib {
    bytes32 internal constant ORDER_TYPEHASH = keccak256(
        "Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 deadline,uint256 nonce,uint256 srcChainId,uint256 dstChainId)"
    );

    function hash(ISimpleOrder.Order calldata order) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            ORDER_TYPEHASH,
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
}