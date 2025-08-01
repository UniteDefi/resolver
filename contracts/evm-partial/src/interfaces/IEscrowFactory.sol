// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./IBaseEscrow.sol";

interface IEscrowFactory {
    function addressOfEscrowSrc(IBaseEscrow.Immutables memory immutables) external view returns (address);
    function createSrcEscrow(IBaseEscrow.Immutables calldata immutables) external payable returns (address);
    function createDstEscrow(IBaseEscrow.Immutables calldata immutables, uint256 srcCancellationTimestamp) external payable returns (address);
    
    // Partial filling functions
    function createSrcEscrowPartial(IBaseEscrow.Immutables calldata immutables, uint256 partialAmount) external payable returns (address);
    function createDstEscrowPartial(IBaseEscrow.Immutables calldata immutables, uint256 srcCancellationTimestamp, uint256 partialAmount) external payable returns (address);
    
    // Partial fill support with explicit resolver address
    function createSrcEscrowPartialFor(IBaseEscrow.Immutables calldata immutables, uint256 partialAmount, address resolver) external payable returns (address);
    function createDstEscrowPartialFor(IBaseEscrow.Immutables calldata immutables, uint256 srcCancellationTimestamp, uint256 partialAmount, address resolver) external payable returns (address);
    
    // View functions for partial filling
    function getResolverPartialAmount(bytes32 orderHash, address resolver) external view returns (uint256);
    function getResolverSafetyDeposit(bytes32 orderHash, address resolver) external view returns (uint256);
    function getTotalFilledAmount(bytes32 orderHash) external view returns (uint256);
}