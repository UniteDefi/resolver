// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./Resolver.sol";
import "./DutchAuction.sol";
import {IBaseEscrow} from "../lib/cross-chain-swap/contracts/interfaces/IBaseEscrow.sol";
import {IEscrow} from "../lib/cross-chain-swap/contracts/interfaces/IEscrow.sol";
import {IEscrowFactory} from "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import {IOrderMixin} from "limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import {TakerTraits} from "limit-order-protocol/contracts/libraries/TakerTraitsLib.sol";
import {TimelocksLib, Timelocks} from "../lib/cross-chain-swap/contracts/libraries/TimelocksLib.sol";

/**
 * @title UniteDefi Resolver with Dutch Auction support
 * @notice Extends base Resolver to integrate dutch auction mechanics
 * @dev Manages cross-chain swaps with auction-based pricing
 */
contract UniteResolver is Resolver {
    using TimelocksLib for Timelocks;
    
    DutchAuction public immutable dutchAuction;
    IEscrowFactory private immutable _FACTORY;
    IOrderMixin private immutable _LOP;
    
    mapping(bytes32 => bytes32) public auctionToEscrow;
    mapping(bytes32 => bytes32) public escrowToAuction;
    
    event AuctionLinkedToEscrow(bytes32 indexed auctionId, bytes32 indexed escrowId);
    event CrossChainAuctionInitiated(
        bytes32 indexed auctionId,
        uint256 srcChainId,
        uint256 dstChainId,
        address indexed seller
    );

    error AuctionNotFound();
    error EscrowNotLinked();

    constructor(
        IEscrowFactory factory,
        IOrderMixin lop,
        address initialOwner,
        address _dutchAuction
    ) Resolver(factory, lop, initialOwner) {
        dutchAuction = DutchAuction(_dutchAuction);
        _FACTORY = factory;
        _LOP = lop;
    }

    /**
     * @notice Creates auction and deploys source chain escrow
     * @param auctionParams Parameters for dutch auction
     * @param immutables Escrow immutables
     * @param order Limit order
     */
    function createAuctionWithEscrow(
        DutchAuction.Auction memory auctionParams,
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args
    ) external payable {
        bytes32 auctionId = keccak256(
            abi.encodePacked(
                msg.sender,
                block.timestamp,
                auctionParams.token,
                auctionParams.amount
            )
        );
        
        dutchAuction.createAuction(
            auctionId,
            auctionParams.token,
            auctionParams.amount,
            auctionParams.startPrice,
            auctionParams.endPrice,
            auctionParams.duration
        );
        
        bytes32 escrowId = keccak256(abi.encodePacked(immutables.orderHash, immutables.hashlock));
        auctionToEscrow[auctionId] = escrowId;
        escrowToAuction[escrowId] = auctionId;
        
        emit AuctionLinkedToEscrow(auctionId, escrowId);
        
        // Deploy source escrow directly since deploySrc has onlyOwner modifier
        IBaseEscrow.Immutables memory immutablesMem = immutables;
        immutablesMem.timelocks = TimelocksLib.setDeployedAt(immutables.timelocks, block.timestamp);
        address computed = IEscrowFactory(address(_FACTORY)).addressOfEscrowSrc(immutablesMem);

        (bool success,) = address(computed).call{value: immutablesMem.safetyDeposit}("");
        if (!success) revert IBaseEscrow.NativeTokenSendingFailure();

        // _ARGS_HAS_TARGET = 1 << 251
        takerTraits = TakerTraits.wrap(TakerTraits.unwrap(takerTraits) | uint256(1 << 251));
        bytes memory argsMem = abi.encodePacked(computed, args);
        IOrderMixin(address(_LOP)).fillOrderArgs(order, r, vs, amount, takerTraits, argsMem);
    }

    /**
     * @notice Settles auction and initiates cross-chain transfer
     * @param auctionId Auction to settle
     * @param dstImmutables Destination chain escrow parameters
     */
    function settleAuctionCrossChain(
        bytes32 auctionId,
        IBaseEscrow.Immutables calldata dstImmutables,
        uint256 srcCancellationTimestamp
    ) external payable {
        bytes32 escrowId = auctionToEscrow[auctionId];
        if (escrowId == bytes32(0)) revert EscrowNotLinked();
        
        uint256 currentPrice = dutchAuction.getCurrentPrice(auctionId);
        dutchAuction.settleAuction{value: msg.value}(auctionId);
        
        // Deploy destination escrow directly
        _FACTORY.createDstEscrow{value: msg.value}(dstImmutables, srcCancellationTimestamp);
        
        emit CrossChainAuctionInitiated(
            auctionId,
            block.chainid,
            block.chainid, // Using current chain id as placeholder
            msg.sender
        );
    }

    /**
     * @notice Gets current auction price for a linked escrow
     * @param escrowId Escrow identifier
     * @return Current auction price
     */
    function getEscrowAuctionPrice(bytes32 escrowId) external view returns (uint256) {
        bytes32 auctionId = escrowToAuction[escrowId];
        if (auctionId == bytes32(0)) revert AuctionNotFound();
        return dutchAuction.getCurrentPrice(auctionId);
    }

    /**
     * @notice Checks if an escrow has an active auction
     * @param escrowId Escrow identifier
     * @return Whether linked auction is active
     */
    function hasActiveAuction(bytes32 escrowId) external view returns (bool) {
        bytes32 auctionId = escrowToAuction[escrowId];
        if (auctionId == bytes32(0)) return false;
        return dutchAuction.isAuctionActive(auctionId);
    }
}