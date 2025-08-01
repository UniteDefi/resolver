// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./IBaseEscrow.sol";

interface IEscrowFactory {
    function addressOfEscrowSrc(IBaseEscrow.Immutables memory immutables) external view returns (address);
    function createSrcEscrow(IBaseEscrow.Immutables calldata immutables) external payable returns (address);
    function createDstEscrow(IBaseEscrow.Immutables calldata immutables, uint256 srcCancellationTimestamp) external payable returns (address);
}