// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ISimpleOrder {
    struct Order {
        uint256 salt;
        address maker;
        address receiver;
        address makerAsset;
        address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 deadline;
        uint256 nonce;
        uint256 srcChainId;
        uint256 dstChainId;
    }

    error BadSignature();
    error OrderExpired();
    error InvalidNonce();
    error InvalidAmount();
    error TransferFailed();
    error InvalidOrder();
}