// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/access/Ownable.sol";
import "./MockEscrowFactory.sol";

/**
 * @title Mock Resolver Base for Testing
 * @notice Simplified resolver implementation for testing V2 architecture
 */
contract MockResolver is Ownable {
    IEscrowFactory public immutable factory;
    address public immutable orderMixin;
    
    // TakerTraits struct for compatibility
    struct TakerTraits {
        uint256 value;
        uint256 deadline;
    }
    
    constructor(
        IEscrowFactory _factory,
        address _orderMixin,
        address initialOwner
    ) Ownable(initialOwner) {
        factory = _factory;
        orderMixin = _orderMixin;
    }
    
    /**
     * @notice Deploy source chain escrow
     */
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits memory takerTraits,
        bytes calldata args
    ) internal returns (address) {
        // Mock implementation - just call factory
        IEscrow escrow = factory.deploySrc{value: msg.value}(immutables, args);
        return address(escrow);
    }
    
    /**
     * @notice Deploy destination chain escrow
     */
    function deployDst(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp
    ) internal returns (address) {
        // Mock implementation
        IEscrow escrow = factory.deployDst{value: msg.value}(immutables, srcCancellationTimestamp, "");
        return address(escrow);
    }
}