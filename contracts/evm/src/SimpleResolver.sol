// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IEscrowFactory} from "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import {IBaseEscrow} from "../lib/cross-chain-swap/contracts/interfaces/IBaseEscrow.sol";
import {TimelocksLib, Timelocks} from "../lib/cross-chain-swap/contracts/libraries/TimelocksLib.sol";
import {IEscrow} from "../lib/cross-chain-swap/contracts/interfaces/IEscrow.sol";
import {ImmutablesLib} from "../lib/cross-chain-swap/contracts/libraries/ImmutablesLib.sol";
import {ISimpleOrderProtocol} from "./one-inch/interfaces/ISimpleOrderProtocol.sol";
import {ISimpleOrder} from "./one-inch/interfaces/ISimpleOrder.sol";

/**
 * @title Simple Resolver for cross-chain swaps
 * @notice Resolver that uses our simplified LimitOrderProtocol
 */
contract SimpleResolver is Ownable {
    using ImmutablesLib for IBaseEscrow.Immutables;
    using TimelocksLib for Timelocks;

    error InvalidLength();
    error LengthMismatch();

    IEscrowFactory private immutable _FACTORY;
    ISimpleOrderProtocol private immutable _LOP;

    constructor(
        IEscrowFactory factory, 
        ISimpleOrderProtocol lop, 
        address initialOwner
    ) Ownable(initialOwner) {
        _FACTORY = factory;
        _LOP = lop;
    }

    receive() external payable {}

    /**
     * @notice Deploy source escrow and fill order
     */
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        ISimpleOrder.Order calldata order,
        bytes calldata signature,
        uint256 amount
    ) external payable onlyOwner {
        // Update timelocks with current timestamp
        IBaseEscrow.Immutables memory immutablesMem = immutables;
        immutablesMem.timelocks = TimelocksLib.setDeployedAt(immutables.timelocks, block.timestamp);
        
        // Calculate escrow address
        address escrowAddress = _FACTORY.addressOfEscrowSrc(immutablesMem);

        // Send safety deposit to escrow
        (bool success,) = escrowAddress.call{value: msg.value}("");
        if (!success) revert IBaseEscrow.NativeTokenSendingFailure();

        // Fill the order with escrow as target
        // For cross-chain swaps, we pass takingAmount as 0 since taker asset is on destination chain
        // The order still contains the expected takingAmount for validation on destination chain
        _LOP.fillOrder(order, signature, amount, 0, escrowAddress);
    }

    /**
     * @notice Deploy destination escrow
     */
    function deployDst(
        IBaseEscrow.Immutables calldata dstImmutables, 
        uint256 srcCancellationTimestamp
    ) external payable onlyOwner {
        _FACTORY.createDstEscrow{value: msg.value}(dstImmutables, srcCancellationTimestamp);
    }

    /**
     * @notice Withdraw from escrow
     */
    function withdraw(
        IEscrow escrow, 
        bytes32 secret, 
        IBaseEscrow.Immutables calldata immutables
    ) external {
        escrow.withdraw(secret, immutables);
    }

    /**
     * @notice Cancel escrow
     */
    function cancel(
        IEscrow escrow, 
        IBaseEscrow.Immutables calldata immutables
    ) external {
        escrow.cancel(immutables);
    }

    /**
     * @notice Execute arbitrary calls (for emergency purposes)
     */
    function arbitraryCalls(
        address[] calldata targets, 
        bytes[] calldata arguments
    ) external onlyOwner {
        uint256 length = targets.length;
        if (targets.length != arguments.length) revert LengthMismatch();
        
        for (uint256 i = 0; i < length; ++i) {
            (bool success,) = targets[i].call(arguments[i]);
            if (!success) {
                assembly {
                    returndatacopy(0, 0, returndatasize())
                    revert(0, returndatasize())
                }
            }
        }
    }
}