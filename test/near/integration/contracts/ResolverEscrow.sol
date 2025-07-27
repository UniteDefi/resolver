// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

contract ResolverEscrow {
    struct Escrow {
        address resolver;
        address user;
        address token;
        uint256 amount;
        uint256 safetyDeposit;
        bytes32 secretHash;
        uint256 timeout;
        bool isSourceEscrow; // true for source chain, false for destination
        bool isCompleted;
        bool isRefunded;
        bytes32 revealedSecret;
    }
    
    mapping(bytes32 => Escrow) public escrows;
    mapping(address => uint256) public resolverDeposits;
    
    address public relayerContract;
    
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed resolver,
        address indexed user,
        address token,
        uint256 amount,
        uint256 safetyDeposit,
        bool isSourceEscrow
    );
    
    event EscrowCompleted(
        bytes32 indexed escrowId,
        bytes32 secret
    );
    
    event EscrowRefunded(
        bytes32 indexed escrowId,
        address indexed recipient
    );
    
    event SafetyDepositClaimed(
        bytes32 indexed escrowId,
        address indexed claimer
    );
    
    modifier onlyRelayer() {
        require(msg.sender == relayerContract, "Only relayer can call");
        _;
    }
    
    constructor(address _relayerContract) {
        relayerContract = _relayerContract;
    }
    
    function createEscrow(
        bytes32 escrowId,
        address user,
        address token,
        uint256 amount,
        bytes32 secretHash,
        uint256 timeout,
        bool isSourceEscrow
    ) external payable {
        require(escrows[escrowId].resolver == address(0), "Escrow already exists");
        require(msg.value > 0, "Safety deposit required");
        
        escrows[escrowId] = Escrow({
            resolver: msg.sender,
            user: user,
            token: token,
            amount: amount,
            safetyDeposit: msg.value,
            secretHash: secretHash,
            timeout: timeout,
            isSourceEscrow: isSourceEscrow,
            isCompleted: false,
            isRefunded: false,
            revealedSecret: bytes32(0)
        });
        
        resolverDeposits[msg.sender] += msg.value;
        
        // For destination escrows, resolver must deposit tokens immediately
        if (!isSourceEscrow && token != address(0)) {
            require(
                IERC20(token).transferFrom(msg.sender, address(this), amount),
                "Token deposit failed"
            );
        }
        
        emit EscrowCreated(escrowId, msg.sender, user, token, amount, msg.value, isSourceEscrow);
    }
    
    function completeEscrow(bytes32 escrowId, bytes32 secret) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.resolver != address(0), "Escrow does not exist");
        require(!escrow.isCompleted, "Already completed");
        require(!escrow.isRefunded, "Already refunded");
        require(sha256(abi.encodePacked(secret)) == escrow.secretHash, "Invalid secret");
        require(block.timestamp <= escrow.timeout, "Escrow expired");
        
        escrow.isCompleted = true;
        escrow.revealedSecret = secret;
        
        if (escrow.isSourceEscrow) {
            // Source chain: Resolver withdraws user funds + safety deposit
            if (escrow.token == address(0)) {
                // ETH transfer (shouldn't happen in source escrow typically)
                payable(escrow.resolver).transfer(escrow.amount + escrow.safetyDeposit);
            } else {
                // Token transfer + safety deposit
                require(IERC20(escrow.token).transfer(escrow.resolver, escrow.amount), "Token transfer failed");
                payable(escrow.resolver).transfer(escrow.safetyDeposit);
            }
        } else {
            // Destination chain: User receives tokens, resolver gets safety deposit back
            if (escrow.token == address(0)) {
                payable(escrow.user).transfer(escrow.amount);
                payable(escrow.resolver).transfer(escrow.safetyDeposit);
            } else {
                require(IERC20(escrow.token).transfer(escrow.user, escrow.amount), "Token transfer failed");
                payable(escrow.resolver).transfer(escrow.safetyDeposit);
            }
        }
        
        resolverDeposits[escrow.resolver] -= escrow.safetyDeposit;
        emit EscrowCompleted(escrowId, secret);
    }
    
    function refundEscrow(bytes32 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.resolver != address(0), "Escrow does not exist");
        require(!escrow.isCompleted, "Already completed");
        require(!escrow.isRefunded, "Already refunded");
        require(block.timestamp > escrow.timeout, "Not expired yet");
        
        escrow.isRefunded = true;
        
        if (escrow.isSourceEscrow) {
            // Source chain: Return tokens to user, safety deposit to resolver
            if (escrow.token != address(0)) {
                require(IERC20(escrow.token).transfer(escrow.user, escrow.amount), "Token refund failed");
            }
            payable(escrow.resolver).transfer(escrow.safetyDeposit);
        } else {
            // Destination chain: Return tokens to resolver, safety deposit to user (penalty)
            if (escrow.token != address(0)) {
                require(IERC20(escrow.token).transfer(escrow.resolver, escrow.amount), "Token refund failed");
            }
            payable(escrow.user).transfer(escrow.safetyDeposit);
        }
        
        resolverDeposits[escrow.resolver] -= escrow.safetyDeposit;
        emit EscrowRefunded(escrowId, msg.sender);
    }
    
    function claimSafetyDeposit(bytes32 escrowId) external {
        Escrow storage escrow = escrows[escrowId];
        require(escrow.resolver != address(0), "Escrow does not exist");
        require(!escrow.isCompleted, "Already completed");
        require(!escrow.isRefunded, "Already refunded");
        require(block.timestamp > escrow.timeout, "Not expired yet");
        require(msg.sender != escrow.resolver, "Resolver cannot claim own deposit");
        
        // Anyone can claim expired escrow's safety deposit as penalty
        escrow.isRefunded = true;
        
        if (!escrow.isSourceEscrow && escrow.token != address(0)) {
            // Return tokens to resolver first
            require(IERC20(escrow.token).transfer(escrow.resolver, escrow.amount), "Token return failed");
        }
        
        // Safety deposit goes to claimer as reward
        payable(msg.sender).transfer(escrow.safetyDeposit);
        resolverDeposits[escrow.resolver] -= escrow.safetyDeposit;
        
        emit SafetyDepositClaimed(escrowId, msg.sender);
    }
    
    function getEscrow(bytes32 escrowId) external view returns (Escrow memory) {
        return escrows[escrowId];
    }
    
    function isEscrowExpired(bytes32 escrowId) external view returns (bool) {
        return block.timestamp > escrows[escrowId].timeout;
    }
}