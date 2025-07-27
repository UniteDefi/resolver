// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "./SimpleDutchAuction.sol";

/**
 * @title SimpleUniteResolverV2 - New Architecture Implementation
 * @notice Implements the new UniteDefi flow with separated auction and escrow creation
 * @dev Resolvers create escrows with safety deposits, exclusive lock mechanism
 */
contract SimpleUniteResolverV2 {
    SimpleDutchAuction public immutable dutchAuction;
    address public owner;
    
    // Safety deposit amount (0.001 ETH)
    uint256 public constant SAFETY_DEPOSIT = 0.001 ether;
    
    // Auction to resolver mapping (who has exclusive rights)
    mapping(bytes32 => address) public auctionResolver;
    
    // Escrow data structures
    mapping(bytes32 => bytes32) public auctionToEscrow;
    mapping(bytes32 => bytes32) public escrowToAuction;
    mapping(bytes32 => EscrowData) public escrows;
    
    struct EscrowData {
        address token;
        uint256 amount;
        address seller;
        address buyer;
        address resolver;
        uint256 srcChainId;
        uint256 dstChainId;
        bytes32 secret;
        bytes32 hashlock;
        uint256 deadline;
        uint256 safetyDeposit;
        bool withdrawn;
        bool refunded;
        bool fundsMovedBySeller;
    }
    
    // Events
    event AuctionPosted(
        bytes32 indexed auctionId,
        address indexed seller,
        address indexed token,
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice
    );
    
    event EscrowCreatedByResolver(
        bytes32 indexed escrowId,
        bytes32 indexed auctionId,
        address indexed resolver,
        uint256 safetyDeposit
    );
    
    event SellerFundsMoved(
        bytes32 indexed escrowId,
        address indexed seller,
        uint256 amount
    );
    
    event SecretRevealed(
        bytes32 indexed escrowId,
        bytes32 secret
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
    
    event SafetyDepositReturned(
        bytes32 indexed escrowId,
        address indexed resolver
    );

    // Errors
    error UnauthorizedCaller();
    error InvalidSecret();
    error EscrowExpired();
    error AlreadyWithdrawn();
    error NotExpired();
    error InsufficientSafetyDeposit();
    error AuctionAlreadyHasResolver();
    error NotAuctionResolver();
    error FundsNotMovedYet();
    error FundsAlreadyMoved();
    error AuctionNotSettled();

    modifier onlyOwner() {
        if (msg.sender != owner) revert UnauthorizedCaller();
        _;
    }

    constructor(address _dutchAuction) {
        dutchAuction = SimpleDutchAuction(_dutchAuction);
        owner = msg.sender;
    }

    /**
     * @notice STEP 1: Relayer posts auction WITHOUT creating escrow
     * @dev This only creates the auction, no escrow is created yet
     */
    function postAuction(
        bytes32 auctionId,
        address token,
        uint256 amount,
        uint256 startPrice,
        uint256 endPrice,
        uint256 duration
    ) external {
        // Create auction through SimpleDutchAuction
        dutchAuction.createAuction(
            auctionId,
            token,
            amount,
            startPrice,
            endPrice,
            duration
        );
        
        emit AuctionPosted(
            auctionId,
            msg.sender,
            token,
            amount,
            startPrice,
            endPrice
        );
    }

    /**
     * @notice STEP 2: Resolver creates escrow with safety deposit
     * @dev Resolver must send 0.001 ETH as safety deposit
     */
    function createEscrowWithDeposit(
        bytes32 auctionId,
        uint256 dstChainId,
        bytes32 hashlock,
        uint256 escrowDeadline
    ) external payable {
        // Check safety deposit
        if (msg.value < SAFETY_DEPOSIT) revert InsufficientSafetyDeposit();
        
        // Check if auction already has a resolver
        if (auctionResolver[auctionId] != address(0)) revert AuctionAlreadyHasResolver();
        
        // Get auction details
        (
            uint256 startPrice,
            uint256 endPrice,
            uint256 startTime,
            uint256 duration,
            address token,
            uint256 amount,
            address seller,
            bool active
        ) = dutchAuction.auctions(auctionId);
        
        require(active, "Auction not active");
        
        // Create escrow
        bytes32 escrowId = keccak256(abi.encodePacked(auctionId, hashlock, block.timestamp));
        
        escrows[escrowId] = EscrowData({
            token: token,
            amount: amount,
            seller: seller,
            buyer: address(0),
            resolver: msg.sender,
            srcChainId: block.chainid,
            dstChainId: dstChainId,
            secret: bytes32(0),
            hashlock: hashlock,
            deadline: escrowDeadline,
            safetyDeposit: msg.value,
            withdrawn: false,
            refunded: false,
            fundsMovedBySeller: false
        });
        
        // Set exclusive resolver lock
        auctionResolver[auctionId] = msg.sender;
        
        // Link auction and escrow
        auctionToEscrow[auctionId] = escrowId;
        escrowToAuction[escrowId] = auctionId;
        
        emit EscrowCreatedByResolver(escrowId, auctionId, msg.sender, msg.value);
    }

    /**
     * @notice STEP 3: Resolver settles auction (exclusive right)
     * @dev Only the resolver who created the escrow can settle
     */
    function settleAuctionAsResolver(bytes32 auctionId) external payable {
        // Check resolver authorization
        if (auctionResolver[auctionId] != msg.sender) revert NotAuctionResolver();
        
        bytes32 escrowId = auctionToEscrow[auctionId];
        require(escrowId != bytes32(0), "No escrow for auction");
        
        EscrowData storage escrow = escrows[escrowId];
        require(escrow.buyer == address(0), "Already settled");
        
        // Settle auction through dutch auction contract
        dutchAuction.settleAuction{value: msg.value}(auctionId);
        
        // Update escrow with buyer (resolver acts as buyer)
        escrow.buyer = msg.sender;
    }

    /**
     * @notice STEP 4: Relayer moves seller funds after resolver commits
     * @dev Seller moves their funds to escrow only after resolver has committed
     */
    function moveSellerFunds(bytes32 escrowId) external payable {
        EscrowData storage escrow = escrows[escrowId];
        
        if (msg.sender != escrow.seller) revert UnauthorizedCaller();
        if (escrow.buyer == address(0)) revert AuctionNotSettled();
        if (escrow.fundsMovedBySeller) revert FundsAlreadyMoved();
        
        // For simplicity, assuming seller sends ETH equivalent to token amount
        require(msg.value >= escrow.amount, "Insufficient funds");
        
        escrow.fundsMovedBySeller = true;
        
        emit SellerFundsMoved(escrowId, msg.sender, msg.value);
    }

    /**
     * @notice STEP 5: Relayer reveals secret after confirmations
     * @dev Seller reveals the secret to allow withdrawal
     */
    function revealSecret(bytes32 escrowId, bytes32 secret) external {
        EscrowData storage escrow = escrows[escrowId];
        
        if (msg.sender != escrow.seller) revert UnauthorizedCaller();
        if (!escrow.fundsMovedBySeller) revert FundsNotMovedYet();
        if (keccak256(abi.encodePacked(secret)) != escrow.hashlock) revert InvalidSecret();
        
        escrow.secret = secret;
        
        emit SecretRevealed(escrowId, secret);
    }

    /**
     * @notice STEP 6: Resolver withdraws with revealed secret
     * @dev Resolver uses the revealed secret to claim funds and get deposit back
     */
    function withdrawWithSecret(bytes32 escrowId, bytes32 secret) external {
        EscrowData storage escrow = escrows[escrowId];
        
        if (escrow.withdrawn) revert AlreadyWithdrawn();
        if (block.timestamp > escrow.deadline) revert EscrowExpired();
        if (keccak256(abi.encodePacked(secret)) != escrow.hashlock) revert InvalidSecret();
        if (msg.sender != escrow.buyer) revert UnauthorizedCaller();
        
        escrow.withdrawn = true;
        escrow.secret = secret;
        
        // Transfer funds to buyer (resolver)
        uint256 totalAmount = escrow.amount + escrow.safetyDeposit;
        payable(escrow.buyer).transfer(totalAmount);
        
        emit EscrowWithdrawn(escrowId, escrow.buyer, secret);
        emit SafetyDepositReturned(escrowId, escrow.resolver);
    }

    /**
     * @notice Refund mechanism after deadline
     * @dev Seller can refund if deadline passed and not withdrawn
     */
    function refundEscrow(bytes32 escrowId) external {
        EscrowData storage escrow = escrows[escrowId];
        
        if (escrow.withdrawn) revert AlreadyWithdrawn();
        if (escrow.refunded) revert AlreadyWithdrawn();
        if (block.timestamp <= escrow.deadline) revert NotExpired();
        if (msg.sender != escrow.seller) revert UnauthorizedCaller();
        
        escrow.refunded = true;
        
        // Refund to seller (if funds were moved)
        if (escrow.fundsMovedBySeller) {
            payable(escrow.seller).transfer(escrow.amount);
        }
        
        // Return safety deposit to resolver
        if (escrow.safetyDeposit > 0) {
            payable(escrow.resolver).transfer(escrow.safetyDeposit);
            emit SafetyDepositReturned(escrowId, escrow.resolver);
        }
        
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

    /**
     * @notice Checks if caller is the exclusive resolver for an auction
     */
    function isResolverForAuction(bytes32 auctionId, address resolver) external view returns (bool) {
        return auctionResolver[auctionId] == resolver;
    }

    receive() external payable {}
}