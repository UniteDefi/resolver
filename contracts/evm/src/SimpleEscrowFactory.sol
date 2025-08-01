// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";

import "./interfaces/IEscrowFactory.sol";
import "./interfaces/IBaseEscrow.sol";
import "./libraries/ImmutablesLib.sol";
import "./SimpleEscrow.sol";

contract SimpleEscrowFactory is IEscrowFactory, Ownable {
    using ImmutablesLib for IBaseEscrow.Immutables;

    // Events
    event EscrowCreated(address indexed escrow, bytes32 indexed orderHash, bool isSource);
    
    // Errors
    error InsufficientSafetyDeposit();
    error EscrowAlreadyExists();
    error InvalidImmutables();
    
    // Storage
    mapping(address => bool) public isValidEscrow;
    mapping(bytes32 => address) public srcEscrows;
    mapping(bytes32 => address) public dstEscrows;
    
    constructor(address initialOwner) Ownable(initialOwner) {}

    function addressOfEscrowSrc(IBaseEscrow.Immutables memory immutables) public view override returns (address) {
        bytes32 salt = immutables.hash();
        bytes memory bytecode = type(SimpleEscrow).creationCode;
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    function addressOfEscrowDst(IBaseEscrow.Immutables memory immutables) public view returns (address) {
        // Use a different salt for destination escrows to avoid conflicts
        bytes32 salt = keccak256(abi.encodePacked("DST", immutables.hash()));
        bytes memory bytecode = type(SimpleEscrow).creationCode;
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    function createSrcEscrow(IBaseEscrow.Immutables calldata immutables) external payable returns (address) {
        if (msg.value < immutables.safetyDeposit) revert InsufficientSafetyDeposit();
        
        bytes32 salt = immutables.hash();
        address escrow = Create2.deploy(0, salt, type(SimpleEscrow).creationCode);
        
        if (srcEscrows[immutables.orderHash] != address(0)) revert EscrowAlreadyExists();
        
        srcEscrows[immutables.orderHash] = escrow;
        isValidEscrow[escrow] = true;
        
        // Initialize the escrow
        SimpleEscrow(payable(escrow)).initialize{value: msg.value}(immutables, true);
        
        emit EscrowCreated(escrow, immutables.orderHash, true);
        
        return escrow;
    }

    function createDstEscrow(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp
    ) external payable override returns (address) {
        if (msg.value < immutables.safetyDeposit) revert InsufficientSafetyDeposit();
        
        // Use different salt for destination
        bytes32 salt = keccak256(abi.encodePacked("DST", immutables.hash()));
        address escrow = Create2.deploy(0, salt, type(SimpleEscrow).creationCode);
        
        if (dstEscrows[immutables.orderHash] != address(0)) revert EscrowAlreadyExists();
        
        dstEscrows[immutables.orderHash] = escrow;
        isValidEscrow[escrow] = true;
        
        // Initialize the escrow with srcCancellationTimestamp
        SimpleEscrow(payable(escrow)).initializeDst{value: msg.value}(immutables, srcCancellationTimestamp);
        
        emit EscrowCreated(escrow, immutables.orderHash, false);
        
        return escrow;
    }
}