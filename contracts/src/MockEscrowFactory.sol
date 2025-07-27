// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title Mock Escrow Factory for Testing
 * @notice Simplified escrow factory for cross-chain swap testing
 */
contract MockEscrowFactory {
    using SafeERC20 for IERC20;
    
    address public owner;
    address public relayer;
    
    // Escrow tracking
    mapping(bytes32 => address) public srcEscrows;
    mapping(bytes32 => address) public dstEscrows;
    
    event SrcEscrowCreated(bytes32 indexed auctionId, address escrow);
    event DstEscrowCreated(bytes32 indexed auctionId, address escrow);
    event RelayerSet(address indexed newRelayer);
    event UserFundsMoved(address indexed user, address indexed token, uint256 amount, address escrow);
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }
    
    modifier onlyRelayer() {
        require(msg.sender == relayer, "Not relayer");
        _;
    }
    
    constructor(address _relayer) {
        owner = msg.sender;
        relayer = _relayer;
    }
    
    function setRelayer(address newRelayer) external onlyOwner {
        relayer = newRelayer;
        emit RelayerSet(newRelayer);
    }
    
    /**
     * @notice Create source escrow (mock implementation)
     */
    function createSrcEscrow(bytes32 auctionId) external returns (address) {
        require(srcEscrows[auctionId] == address(0), "Escrow exists");
        
        // For testing, use a deterministic address based on auctionId
        address escrow = address(uint160(uint256(keccak256(abi.encodePacked("src", auctionId)))));
        srcEscrows[auctionId] = escrow;
        
        emit SrcEscrowCreated(auctionId, escrow);
        return escrow;
    }
    
    /**
     * @notice Create destination escrow (mock implementation)
     */
    function createDstEscrow(bytes32 auctionId) external returns (address) {
        require(dstEscrows[auctionId] == address(0), "Escrow exists");
        
        // For testing, use a deterministic address based on auctionId
        address escrow = address(uint160(uint256(keccak256(abi.encodePacked("dst", auctionId)))));
        dstEscrows[auctionId] = escrow;
        
        emit DstEscrowCreated(auctionId, escrow);
        return escrow;
    }
    
    /**
     * @notice Move user's pre-approved funds to escrow
     */
    function moveUserFundsToEscrow(
        address user,
        address token,
        uint256 amount,
        address escrow
    ) external onlyRelayer {
        // Check allowance
        uint256 allowance = IERC20(token).allowance(user, address(this));
        require(allowance >= amount, "Insufficient allowance");
        
        // Transfer from user to this contract first
        IERC20(token).safeTransferFrom(user, address(this), amount);
        
        // In production, would transfer to actual escrow
        // For now, just hold in factory
        
        emit UserFundsMoved(user, token, amount, escrow);
    }
    
    /**
     * @notice Emergency withdraw (testing only)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            payable(owner).transfer(amount);
        } else {
            IERC20(token).safeTransfer(owner, amount);
        }
    }
}