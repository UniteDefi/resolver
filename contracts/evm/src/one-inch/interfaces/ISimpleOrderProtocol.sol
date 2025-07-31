// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./ISimpleOrder.sol";

interface ISimpleOrderProtocol {
    event OrderFilled(
        bytes32 indexed orderHash,
        address indexed maker,
        address indexed taker,
        uint256 makingAmount,
        uint256 takingAmount
    );

    event OrderCancelled(bytes32 indexed orderHash);

    function fillOrder(
        ISimpleOrder.Order calldata order,
        bytes calldata signature,
        uint256 makingAmount,
        uint256 takingAmount,
        address target
    ) external payable returns (uint256 actualMakingAmount, uint256 actualTakingAmount, bytes32 orderHash);

    function cancelOrder(ISimpleOrder.Order calldata order) external;

    function hashOrder(ISimpleOrder.Order calldata order) external view returns (bytes32);

    function invalidatedOrders(bytes32 orderHash) external view returns (bool);

    function nonces(address maker) external view returns (uint256);
}