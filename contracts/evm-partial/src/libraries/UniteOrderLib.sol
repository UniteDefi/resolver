// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "../interfaces/IUniteOrder.sol";

library UniteOrderLib {
    bytes32 internal constant ORDER_TYPEHASH = keccak256(
        "Order(uint256 salt,address maker,address receiver,address makerAsset,address takerAsset,uint256 makingAmount,uint256 takingAmount,uint256 deadline,uint256 nonce,uint256 srcChainId,uint256 dstChainId,uint256 auctionStartTime,uint256 auctionEndTime,uint256 startPrice,uint256 endPrice)"
    );

    function hash(IUniteOrder.Order calldata order) internal pure returns (bytes32) {
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
            order.dstChainId,
            order.auctionStartTime,
            order.auctionEndTime,
            order.startPrice,
            order.endPrice
        ));
    }
}