// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {Create2} from "@openzeppelin/contracts/utils/Create2.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "./interfaces/IEscrowFactory.sol";
import "./interfaces/IBaseEscrow.sol";
import "./libraries/ImmutablesLib.sol";
import "./UniteEscrow.sol";

contract UniteEscrowFactory is IEscrowFactory, Ownable {
    using ImmutablesLib for IBaseEscrow.Immutables;

    // Events
    event EscrowCreated(address indexed escrow, bytes32 indexed orderHash, bool isSource);
    event ResolverAdded(address indexed escrow, address indexed resolver, uint256 amount, uint256 safetyDeposit);
    
    // Errors
    error InsufficientSafetyDeposit();
    error EscrowAlreadyExists();
    error InvalidImmutables();
    error ResolverAlreadyExists();
    error InvalidAmount();
    
    // Storage for partial filling support
    mapping(address => bool) public isValidEscrow;
    mapping(bytes32 => address) public srcEscrows;
    mapping(bytes32 => address) public dstEscrows;
    
    // Track resolver participation in partial fills
    // orderHash => resolver => partial amount
    mapping(bytes32 => mapping(address => uint256)) public resolverPartialAmounts;
    // orderHash => resolver => safety deposit
    mapping(bytes32 => mapping(address => uint256)) public resolverSafetyDeposits;
    // orderHash => total filled amount
    mapping(bytes32 => uint256) public totalFilledAmounts;
    
    constructor(address initialOwner) Ownable(initialOwner) {}

    function addressOfEscrowSrc(IBaseEscrow.Immutables memory immutables) public view override returns (address) {
        bytes32 salt = immutables.hash();
        bytes memory bytecode = type(UniteEscrow).creationCode;
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    function addressOfEscrowDst(IBaseEscrow.Immutables memory immutables) public view returns (address) {
        // Use a different salt for destination escrows to avoid conflicts
        bytes32 salt = keccak256(abi.encodePacked("DST", immutables.hash()));
        bytes memory bytecode = type(UniteEscrow).creationCode;
        return Create2.computeAddress(salt, keccak256(bytecode));
    }

    function createSrcEscrow(IBaseEscrow.Immutables calldata immutables) external payable returns (address) {
        return createSrcEscrowPartial(immutables, immutables.amount);
    }
    
    function createSrcEscrowPartial(
        IBaseEscrow.Immutables calldata immutables, 
        uint256 partialAmount
    ) public payable returns (address) {
        return createSrcEscrowPartialFor(immutables, partialAmount, msg.sender);
    }
    
    function createSrcEscrowPartialFor(
        IBaseEscrow.Immutables calldata immutables, 
        uint256 partialAmount,
        address resolver
    ) public payable returns (address) {
        if (partialAmount == 0 || partialAmount > immutables.amount) revert InvalidAmount();
        
        // CONSTANT SAFETY DEPOSIT: Use the safety deposit from immutables directly
        // This represents the fixed safety deposit amount per resolver
        uint256 requiredSafetyDeposit = immutables.safetyDeposit;
        if (msg.value < requiredSafetyDeposit) revert InsufficientSafetyDeposit();
        
        // Check if resolver already participated
        if (resolverPartialAmounts[immutables.orderHash][resolver] > 0) {
            revert ResolverAlreadyExists();
        }
        
        bytes32 salt = immutables.hash();
        address escrow;
        
        // Calculate the escrow address first
        address predictedEscrowAddress = Create2.computeAddress(salt, keccak256(type(UniteEscrow).creationCode));
        
        // Check if escrow already exists
        if (srcEscrows[immutables.orderHash] == address(0)) {
            // First resolver - deploy the escrow
            escrow = Create2.deploy(0, salt, type(UniteEscrow).creationCode);
            require(escrow == predictedEscrowAddress, "Escrow address mismatch");
            
            srcEscrows[immutables.orderHash] = escrow;
            isValidEscrow[escrow] = true;
            
            // Initialize the escrow with original immutables
            UniteEscrow(payable(escrow)).initialize{value: msg.value}(immutables, true);
            
            // Handle first resolver (no additional value - it's already in the escrow)
            UniteEscrow(payable(escrow)).handleFirstResolver(resolver, partialAmount, msg.value);
            
            emit EscrowCreated(escrow, immutables.orderHash, true);
        } else {
            // Subsequent resolvers - escrow already exists, use the stored address
            escrow = srcEscrows[immutables.orderHash];
            require(escrow == predictedEscrowAddress, "Escrow address mismatch");
            
            // Add safety deposit to existing escrow
            UniteEscrow(payable(escrow)).addResolverSafetyDeposit{value: msg.value}(resolver, partialAmount);
        }
        
        // Track this resolver's participation
        resolverPartialAmounts[immutables.orderHash][resolver] = partialAmount;
        resolverSafetyDeposits[immutables.orderHash][resolver] = msg.value;
        totalFilledAmounts[immutables.orderHash] += partialAmount;
        
        emit ResolverAdded(escrow, resolver, partialAmount, msg.value);
        
        return escrow;
    }

    function createDstEscrow(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp
    ) external payable override returns (address) {
        return createDstEscrowPartial(immutables, srcCancellationTimestamp, immutables.amount);
    }
    
    function createDstEscrowPartial(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp,
        uint256 partialAmount
    ) public payable returns (address) {
        return createDstEscrowPartialFor(immutables, srcCancellationTimestamp, partialAmount, msg.sender);
    }
    
    function createDstEscrowPartialFor(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp,
        uint256 partialAmount,
        address resolver
    ) public payable returns (address) {
        // For destination escrows, partialAmount is in destination token (DAI)
        // We validate that partialAmount > 0 but skip the cross-token comparison
        if (partialAmount == 0) revert InvalidAmount();
        
        // CONSTANT SAFETY DEPOSIT: Use the safety deposit from immutables directly
        uint256 requiredSafetyDeposit = immutables.safetyDeposit;
        if (msg.value < requiredSafetyDeposit) revert InsufficientSafetyDeposit();
        
        // Check if resolver already participated
        if (resolverPartialAmounts[immutables.orderHash][resolver] > 0) {
            revert ResolverAlreadyExists();
        }
        
        // Use different salt for destination
        bytes32 salt = keccak256(abi.encodePacked("DST", immutables.hash()));
        
        // Calculate the escrow address first
        address predictedEscrowAddress = Create2.computeAddress(salt, keccak256(type(UniteEscrow).creationCode));
        address escrow;
        
        // Check if escrow already exists
        if (dstEscrows[immutables.orderHash] == address(0)) {
            // First resolver - deploy the escrow
            escrow = Create2.deploy(0, salt, type(UniteEscrow).creationCode);
            require(escrow == predictedEscrowAddress, "Escrow address mismatch");
            
            dstEscrows[immutables.orderHash] = escrow;
            isValidEscrow[escrow] = true;
            
            // Initialize the escrow with original immutables
            UniteEscrow(payable(escrow)).initializeDst{value: msg.value}(immutables, srcCancellationTimestamp);
            
            // Handle first resolver
            UniteEscrow(payable(escrow)).handleFirstResolver(resolver, partialAmount, msg.value);
            
            emit EscrowCreated(escrow, immutables.orderHash, false);
        } else {
            // Subsequent resolvers - escrow already exists, use the stored address
            escrow = dstEscrows[immutables.orderHash];
            require(escrow == predictedEscrowAddress, "Escrow address mismatch");
            
            // Add safety deposit to existing escrow
            UniteEscrow(payable(escrow)).addResolverSafetyDeposit{value: msg.value}(resolver, partialAmount);
        }
        
        // Track this resolver's participation (in destination token amounts)
        resolverPartialAmounts[immutables.orderHash][resolver] = partialAmount;
        resolverSafetyDeposits[immutables.orderHash][resolver] = msg.value;
        totalFilledAmounts[immutables.orderHash] += partialAmount;
        
        emit ResolverAdded(escrow, resolver, partialAmount, msg.value);
        
        return escrow;
    }
    
    // View functions for partial filling support
    function getResolverPartialAmount(bytes32 orderHash, address resolver) external view returns (uint256) {
        return resolverPartialAmounts[orderHash][resolver];
    }
    
    function getResolverSafetyDeposit(bytes32 orderHash, address resolver) external view returns (uint256) {
        return resolverSafetyDeposits[orderHash][resolver];
    }
    
    function getTotalFilledAmount(bytes32 orderHash) external view returns (uint256) {
        return totalFilledAmounts[orderHash];
    }
    
    // Function to transfer user funds to escrow after all resolvers commit
    function transferUserFunds(
        bytes32 orderHash,
        address from,
        address token,
        uint256 amount
    ) external onlyOwner {
        address escrow = srcEscrows[orderHash];
        require(escrow != address(0), "Escrow not found");
        require(totalFilledAmounts[orderHash] >= amount, "Not enough commitments");
        
        // Transfer tokens from user to escrow
        IERC20(token).transferFrom(from, escrow, amount);
        
        // Mark the escrow as funded
        UniteEscrow(payable(escrow)).markUserFunded();
    }
}