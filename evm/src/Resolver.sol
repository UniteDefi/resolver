// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";

import "./interfaces/IOrderMixin.sol";
import "./interfaces/IEscrowFactory.sol";
import "./interfaces/IBaseEscrow.sol";
import "./interfaces/IEscrow.sol";
import "./libraries/TimelocksLib.sol";
import "./libraries/ImmutablesLib.sol";

/**
 * @title Sample implementation of a Resolver contract for cross-chain swap.
 * @dev It is important when deploying an escrow on the source chain to send the safety deposit and deploy the escrow in the same
 * transaction, since the address of the escrow depends on the block.timestamp.
 * You can find sample code for this in the {ResolverExample-deploySrc}.
 *
 * @custom:security-contact security@1inch.io
 */
contract Resolver is Ownable {
    using ImmutablesLib for IBaseEscrow.Immutables;
    using TimelocksLib for uint256;

    error InvalidLength();
    error LengthMismatch();

    IEscrowFactory private immutable _FACTORY;
    IOrderMixin private immutable _LOP;

    constructor(IEscrowFactory factory, IOrderMixin lop, address initialOwner) Ownable(initialOwner) {
        _FACTORY = factory;
        _LOP = lop;
    }

    receive() external payable {} // solhint-disable-line no-empty-blocks

    /**
     * @notice See {IResolverExample-deploySrc}.
     */
    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        IOrderMixin.TakerTraits takerTraits,
        bytes calldata args
    ) external payable onlyOwner {

        IBaseEscrow.Immutables memory immutablesMem = immutables;
        immutablesMem.timelocks = immutablesMem.timelocks.setDeployedAt(block.timestamp);
        address computed = _FACTORY.addressOfEscrowSrc(immutablesMem);

        (bool success,) = address(computed).call{value: msg.value}("");
        if (!success) revert IBaseEscrow.NativeTokenSendingFailure();

        // _ARGS_HAS_TARGET = 1 << 251
        takerTraits = IOrderMixin.TakerTraits.wrap(IOrderMixin.TakerTraits.unwrap(takerTraits) | uint256(1 << 251));
        bytes memory argsMem = abi.encodePacked(computed, args);
        _LOP.fillOrderArgs(order, r, vs, amount, takerTraits, argsMem);
    }

    /**
     * @notice See {IResolverExample-deployDst}.
     */
    function deployDst(IBaseEscrow.Immutables calldata dstImmutables, uint256 srcCancellationTimestamp) external onlyOwner payable {
        _FACTORY.createDstEscrow{value: msg.value}(dstImmutables, srcCancellationTimestamp);
    }

    function withdraw(IEscrow escrow, bytes32 secret, IBaseEscrow.Immutables calldata immutables) external {
        escrow.withdraw(secret, immutables);
    }


    function cancel(IEscrow escrow, IBaseEscrow.Immutables calldata immutables) external {
        escrow.cancel(immutables);
    }

    /**
     * @notice See {IResolverExample-arbitraryCalls}.
     */
    function arbitraryCalls(address[] calldata targets, bytes[] calldata arguments) external onlyOwner {
        uint256 length = targets.length;
        if (targets.length != arguments.length) revert LengthMismatch();
        for (uint256 i = 0; i < length; ++i) {
            // solhint-disable-next-line avoid-low-level-calls
            (bool success, bytes memory result) = targets[i].call(arguments[i]);
            if (!success) {
                // Forward the revert reason
                if (result.length > 0) {
                    assembly {
                        let size := mload(result)
                        revert(add(32, result), size)
                    }
                } else {
                    revert("Call failed");
                }
            }
        }
    }
}
