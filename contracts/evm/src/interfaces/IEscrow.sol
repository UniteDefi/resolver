// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./IBaseEscrow.sol";

interface IEscrow {
    function withdraw(bytes32 secret, IBaseEscrow.Immutables calldata immutables) external;
    function cancel(IBaseEscrow.Immutables calldata immutables) external;
}