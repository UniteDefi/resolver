// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./SimpleDutchAuction.sol";

/**
 * @title Simplified UniteResolver for UniteDefi
 * @notice Integrates dutch auction with cross-chain capabilities
 * @dev Simplified version without complex dependencies
 */
contract SimpleUniteResolver {
    SimpleDutchAuction public immutable dutchAuction;
    address public owner;
    
    mapping(bytes32 => bytes32) public auctionToEscrow;
    mapping(bytes32 => bytes32) public escrowToAuction;
    mapping(bytes32 => EscrowData) public escrows;
    
    struct EscrowData {
        address token;
        uint256 amount;
        address seller;
        address buyer;
        uint256 srcChainId;
        uint256 dstChainId;
        bytes32 secret;
        bytes32 hashlock;
        uint256 deadline;
        bool withdrawn;
        bool refunded;
    }
    
    event EscrowCreated(
        bytes32 indexed escrowId,
        bytes32 indexed auctionId,
        address indexed seller,
        uint256 srcChainId,
        uint256 dstChainId
    );
    
    event EscrowWithdrawn(
        bytes32 indexed escrowId,
        address indexed buyer,
        bytes32 secret
    );
    
    event EscrowRefunded(
        bytes32 indexed escrowId,
        address indexed seller
    );

    error UnauthorizedCaller();
    error InvalidSecret();
    error EscrowExpired();
    error AlreadyWithdrawn();
    error NotExpired();

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedCaller();
        _;
    }

    constructor(address _dutchAuction) {
        dutchAuction = SimpleDutchAuction(_dutchAuction);
        owner = msg.sender;
    }

    /**
     * @notice Creates auction and associated escrow for cross-chain swap
     */
    function createCrossChainAuction(
        bytes32 auctionId,
        address token,
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration,
        uint256 dstChainId,
        bytes32 hashlock,
        uint256 escrowDeadline
    ) external {
        // Create auction
        dutchAuction.createAuction(
            auctionId,
            token,
            amount,
            startPrice,
            endPrice,
            duration
        );
        
        // Create escrow
        bytes32 escrowId = keccak256(abi.encodePacked(auctionId, hashlock, block.timestamp));
        
        escrows[escrowId] = EscrowData({
            token: token,
            amount: amount,
            seller: msg.sender,
            buyer: address(0),
            srcChainId: block.chainid,
            dstChainId: dstChainId,
            secret: bytes32(0),
            hashlock: hashlock,
            deadline: escrowDeadline,
            withdrawn: false,
            refunded: false
        });
        
        auctionToEscrow[auctionId] = escrowId;
        escrowToAuction[escrowId] = auctionId;
        
        emit EscrowCreated(escrowId, auctionId, msg.sender, block.chainid, dstChainId);
    }

    /**
     * @notice Settles auction and locks funds in escrow
     */
    function settleAuctionWithEscrow(bytes32 auctionId) external payable {
        bytes32 escrowId = auctionToEscrow[auctionId];
        require(escrowId != bytes32(0), "No escrow for auction");
        
        EscrowData storage escrow = escrows[escrowId];
        require(escrow.buyer == address(0), "Already settled");
        
        // Settle auction through dutch auction contract
        dutchAuction.settleAuction{value: msg.value}(auctionId);
        
        // Update escrow with buyer
        escrow.buyer = msg.sender;
    }

    /**
     * @notice Withdraws funds from escrow with secret
     */
    function withdrawWithSecret(bytes32 escrowId, bytes32 secret) external {
        EscrowData storage escrow = escrows[escrowId];
        
        if (escrow.withdrawn) revert AlreadyWithdrawn();
        if (block.timestamp > escrow.deadline) revert EscrowExpired();
        if (keccak256(abi.encodePacked(secret)) != escrow.hashlock) revert InvalidSecret();
        
        escrow.withdrawn = true;
        escrow.secret = secret;
        
        // Transfer to buyer
        payable(escrow.buyer).transfer(escrow.amount);
        
        emit EscrowWithdrawn(escrowId, escrow.buyer, secret);
    }

    /**
     * @notice Refunds escrow after deadline
     */
    function refundEscrow(bytes32 escrowId) external {
        EscrowData storage escrow = escrows[escrowId];
        
        if (escrow.withdrawn) revert AlreadyWithdrawn();
        if (escrow.refunded) revert AlreadyWithdrawn();
        if (block.timestamp <= escrow.deadline) revert NotExpired();
        if (msg.sender != escrow.seller) revert UnauthorizedCaller();
        
        escrow.refunded = true;
        
        // Refund to seller
        payable(escrow.seller).transfer(escrow.amount);
        
        emit EscrowRefunded(escrowId, escrow.seller);
    }

    /**
     * @notice Gets current auction price through dutch auction
     */
    function getAuctionPrice(bytes32 auctionId) external view returns (uint256) {
        return dutchAuction.getCurrentPrice(auctionId);
    }

    /**
     * @notice Checks if auction is active
     */
    function isAuctionActive(bytes32 auctionId) external view returns (bool) {
        return dutchAuction.isAuctionActive(auctionId);
    }

    receive() external payable {}
}