// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./interfaces/IEscrow.sol";
import "./interfaces/IBaseEscrow.sol";
import "./libraries/TimelocksLib.sol";

contract UniteEscrow is IEscrow, IBaseEscrow, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using TimelocksLib for uint256;

    // State
    enum State { Active, Withdrawn, Cancelled }
    State public state;
    
    // Immutable storage (set once during initialization)
    bytes32 public orderHash;
    bytes32 public hashlock;
    address public maker;
    address public taker;
    address public token;
    uint256 public amount; // Total order amount
    uint256 public safetyDeposit; // Per-unit safety deposit 
    uint256 public timelocks;
    bool public isSource;
    uint256 public srcCancellationTimestamp; // Only used for destination escrows
    address public factory; // Factory that deployed this escrow
    
    // Partial filling support
    mapping(address => uint256) public resolverPartialAmounts; // resolver => partial amount they committed
    mapping(address => uint256) public resolverSafetyDeposits; // resolver => safety deposit they made
    mapping(address => bool) public resolverWithdrawn; // track if resolver has withdrawn their share
    address[] public resolvers; // list of participating resolvers
    uint256 public totalPartialAmount; // sum of all partial amounts committed
    uint256 public totalPartialWithdrawn; // sum of all partial amounts withdrawn by resolvers
    bool public fundsDistributed; // track if funds have been distributed

    // Reward for calling after time limit (10% of total safety deposits)
    uint256 public constant CALLER_REWARD_PERCENTAGE = 10;

    // Modifiers
    modifier onlyActive() {
        if (state != State.Active) revert InvalidTime();
        _;
    }

    // Initialize for source escrow (called by first resolver)
    function initialize(Immutables calldata immutables, bool _isSource) external payable {
        require(orderHash == bytes32(0), "Already initialized");
        
        orderHash = immutables.orderHash;
        hashlock = immutables.hashlock;
        maker = address(uint160(immutables.maker));
        taker = address(uint160(immutables.taker));
        token = address(uint160(immutables.token));
        amount = immutables.amount; // Total order amount
        safetyDeposit = immutables.safetyDeposit; // Per-unit safety deposit
        timelocks = TimelocksLib.setDeployedAt(immutables.timelocks, block.timestamp);
        isSource = _isSource;
        state = State.Active;
        factory = msg.sender;
    }

    // Initialize for destination escrow (called by first resolver)
    function initializeDst(Immutables calldata immutables, uint256 _srcCancellationTimestamp) external payable {
        require(orderHash == bytes32(0), "Already initialized");
        
        orderHash = immutables.orderHash;
        hashlock = immutables.hashlock;
        maker = address(uint160(immutables.maker));
        taker = address(uint160(immutables.taker));
        token = address(uint160(immutables.token));
        amount = immutables.amount; // Total order amount
        safetyDeposit = immutables.safetyDeposit; // Per-unit safety deposit
        timelocks = TimelocksLib.setDeployedAt(immutables.timelocks, block.timestamp);
        isSource = false;
        srcCancellationTimestamp = _srcCancellationTimestamp;
        state = State.Active;
        factory = msg.sender;
    }
    
    // Add subsequent resolvers (called by factory for 2nd, 3rd, etc. resolvers)
    function addResolverSafetyDeposit(address resolver, uint256 partialAmount) external payable {
        require(orderHash != bytes32(0), "Not initialized");
        require(resolverPartialAmounts[resolver] == 0, "Resolver already added");
        require(partialAmount > 0, "Invalid partial amount");
        require(msg.value > 0, "No safety deposit");
        
        resolverPartialAmounts[resolver] = partialAmount;
        resolverSafetyDeposits[resolver] = msg.value;
        resolvers.push(resolver);
        totalPartialAmount += partialAmount;
        
        emit ResolverAdded(resolver, partialAmount, msg.value);
    }

    // PERMISSIONLESS WITHDRAWAL - Anyone with the secret can call this
    function withdrawWithSecret(bytes32 secret, Immutables calldata immutables) public nonReentrant onlyActive {
        // Verify secret
        if (keccak256(abi.encodePacked(secret)) != hashlock) revert InvalidSecret();
        
        // Verify immutables match
        _verifyImmutables(immutables);
        
        // Prevent double withdrawal
        if (fundsDistributed) revert AlreadyWithdrawn();
        
        // For destination chain, check that all resolvers have deposited their promised tokens
        if (!isSource) {
            uint256 currentTokenBalance = IERC20(token).balanceOf(address(this));
            if (currentTokenBalance < totalPartialAmount) revert InvalidTime(); // Not all resolvers have deposited
        }
        
        // Check if caller should get reward (only after public withdrawal time and if not maker/resolver)
        uint256 deployedAt = timelocks.getDeployedAt();
        uint256 currentTime = block.timestamp;
        
        bool isAfterTimeLimit = false;
        
        if (isSource) {
            uint256 publicWithdrawalTime = deployedAt + timelocks.srcPublicWithdrawal();
            isAfterTimeLimit = currentTime >= publicWithdrawalTime;
        } else {
            uint256 publicWithdrawalTime = deployedAt + timelocks.dstPublicWithdrawal();
            isAfterTimeLimit = currentTime >= publicWithdrawalTime;
        }
        
        fundsDistributed = true;
        
        // Calculate caller reward if after time limit and caller is not maker/resolver
        uint256 callerReward = 0;
        if (isAfterTimeLimit && msg.sender != maker) {
            // Check if caller is not one of the resolvers
            bool isResolver = false;
            for (uint256 i = 0; i < resolvers.length; i++) {
                if (resolvers[i] == msg.sender) {
                    isResolver = true;
                    break;
                }
            }
            
            if (!isResolver) {
                uint256 totalSafetyDeposits = 0;
                for (uint256 i = 0; i < resolvers.length; i++) {
                    totalSafetyDeposits += resolverSafetyDeposits[resolvers[i]];
                }
                callerReward = (totalSafetyDeposits * CALLER_REWARD_PERCENTAGE) / 100;
            }
        }
        
        if (isSource) {
            // SOURCE CHAIN: Distribute tokens to resolvers, safety deposits back to resolvers (minus caller reward)
            _distributeSourceFunds(callerReward);
        } else {
            // DESTINATION CHAIN: Send tokens to user, safety deposits back to resolvers (minus caller reward)
            _distributeDestinationFunds(callerReward);
        }
        
        // Send caller reward if applicable
        if (callerReward > 0) {
            (bool success,) = msg.sender.call{value: callerReward}("");
            if (!success) revert NativeTokenSendingFailure();
            emit CallerRewarded(msg.sender, callerReward);
        }
        
        state = State.Withdrawn;
        emit FundsDistributed(msg.sender, isAfterTimeLimit);
    }
    
    function _distributeSourceFunds(uint256 callerReward) internal {
        // Distribute tokens proportionally to resolvers
        for (uint256 i = 0; i < resolvers.length; i++) {
            address resolver = resolvers[i];
            uint256 resolverAmount = resolverPartialAmounts[resolver];
            uint256 resolverDeposit = resolverSafetyDeposits[resolver];
            
            // Calculate safety deposit after caller reward deduction
            uint256 actualDeposit = resolverDeposit;
            if (callerReward > 0) {
                uint256 deduction = (resolverDeposit * CALLER_REWARD_PERCENTAGE) / 100;
                actualDeposit = resolverDeposit - deduction;
            }
            
            if (token == address(0)) {
                // Native token
                uint256 totalAmount = resolverAmount + actualDeposit;
                (bool success,) = resolver.call{value: totalAmount}("");
                if (!success) revert NativeTokenSendingFailure();
            } else {
                // ERC20 token
                IERC20(token).safeTransfer(resolver, resolverAmount);
                
                // Return safety deposit
                if (actualDeposit > 0) {
                    (bool success,) = resolver.call{value: actualDeposit}("");
                    if (!success) revert NativeTokenSendingFailure();
                }
            }
            
            emit Withdrawn(resolver, resolverAmount);
        }
    }
    
    function _distributeDestinationFunds(uint256 callerReward) internal {
        // Send all tokens to user (maker)
        if (token == address(0)) {
            // Native token
            (bool success,) = maker.call{value: totalPartialAmount}("");
            if (!success) revert NativeTokenSendingFailure();
        } else {
            // ERC20 token
            IERC20(token).safeTransfer(maker, totalPartialAmount);
        }
        
        emit Withdrawn(maker, totalPartialAmount);
        
        // Return safety deposits to resolvers (minus caller reward)
        for (uint256 i = 0; i < resolvers.length; i++) {
            address resolver = resolvers[i];
            uint256 resolverDeposit = resolverSafetyDeposits[resolver];
            
            // Calculate safety deposit after caller reward deduction
            uint256 actualDeposit = resolverDeposit;
            if (callerReward > 0) {
                uint256 deduction = (resolverDeposit * CALLER_REWARD_PERCENTAGE) / 100;
                actualDeposit = resolverDeposit - deduction;
            }
            
            if (actualDeposit > 0) {
                (bool success,) = resolver.call{value: actualDeposit}("");
                if (!success) revert NativeTokenSendingFailure();
            }
        }
    }

    // LEGACY FUNCTIONS - For backward compatibility, now anyone can call with secret
    function withdrawUser(bytes32 secret, Immutables calldata immutables) external {
        withdrawWithSecret(secret, immutables);
    }
    
    function withdrawResolver(bytes32 secret, Immutables calldata immutables) external {
        withdrawWithSecret(secret, immutables);
    }
    
    function withdraw(bytes32 secret, Immutables calldata immutables) external override {
        withdrawWithSecret(secret, immutables);
    }

    function cancel(Immutables calldata immutables) external override nonReentrant onlyActive {
        // Verify immutables match
        _verifyImmutables(immutables);
        
        // Check cancellation time windows
        uint256 deployedAt = timelocks.getDeployedAt();
        uint256 currentTime = block.timestamp;
        
        if (isSource) {
            // Source chain cancellation
            uint256 cancellationTime = deployedAt + timelocks.srcCancellation();
            uint256 publicCancellationTime = deployedAt + timelocks.srcPublicCancellation();
            
            // Maker can cancel after cancellation time
            // Anyone can cancel after public cancellation time
            if (currentTime < cancellationTime) revert InvalidTime();
            if (currentTime < publicCancellationTime && msg.sender != maker) revert InvalidCaller();
        } else {
            // Destination chain cancellation
            // Can only cancel if source was cancelled first
            if (currentTime < srcCancellationTimestamp) revert InvalidTime();
            
            uint256 cancellationTime = deployedAt + timelocks.dstCancellation();
            
            // Anyone can cancel after cancellation time
            if (currentTime < cancellationTime) revert InvalidTime();
        }
        
        state = State.Cancelled;
        
        // Return all funds to maker and safety deposits to resolvers
        if (token == address(0)) {
            // Native token - return amount to maker
            (bool success,) = maker.call{value: amount}("");
            if (!success) revert NativeTokenSendingFailure();
        } else {
            // ERC20 token - return to maker
            uint256 tokenBalance = IERC20(token).balanceOf(address(this));
            if (tokenBalance > 0) {
                IERC20(token).safeTransfer(maker, tokenBalance);
            }
        }
        
        // Return safety deposits to resolvers
        for (uint256 i = 0; i < resolvers.length; i++) {
            address resolver = resolvers[i];
            uint256 resolverDeposit = resolverSafetyDeposits[resolver];
            if (resolverDeposit > 0) {
                (bool success,) = resolver.call{value: resolverDeposit}("");
                if (!success) revert NativeTokenSendingFailure();
            }
        }
        
        emit Cancelled(maker, amount);
    }

    function _verifyImmutables(Immutables calldata immutables) internal view {
        if (immutables.orderHash != orderHash ||
            immutables.hashlock != hashlock ||
            address(uint160(immutables.maker)) != maker ||
            address(uint160(immutables.taker)) != taker ||
            address(uint160(immutables.token)) != token ||
            immutables.amount != amount ||
            immutables.safetyDeposit != safetyDeposit) {
            revert InvalidImmutables();
        }
    }
    
    // View functions
    function getResolverCount() external view returns (uint256) {
        return resolvers.length;
    }
    
    function getResolver(uint256 index) external view returns (address) {
        return resolvers[index];
    }
    
    function getResolverInfo(address resolver) external view returns (uint256 partialAmount, uint256 resolverDeposit, bool withdrawn) {
        return (resolverPartialAmounts[resolver], resolverSafetyDeposits[resolver], fundsDistributed);
    }
    
    // Events
    event ResolverAdded(address indexed resolver, uint256 partialAmount, uint256 safetyDeposit);
    event FundsDistributed(address indexed caller, bool afterTimeLimit);
    event CallerRewarded(address indexed caller, uint256 reward);

    // Allow receiving tokens and ETH
    receive() external payable {}
    
    // Handle the first resolver during initialization (called by factory only)
    function handleFirstResolver(address resolver, uint256 partialAmount, uint256 resolverDeposit) external {
        // Only allow this if no resolvers have been added yet
        require(resolvers.length == 0, "First resolver already set");
        require(resolverPartialAmounts[resolver] == 0, "Resolver already added");
        require(partialAmount > 0, "Invalid partial amount");
        require(orderHash != bytes32(0), "Not initialized"); // Must be initialized first
        
        resolverPartialAmounts[resolver] = partialAmount;
        resolverSafetyDeposits[resolver] = resolverDeposit;
        resolvers.push(resolver);
        totalPartialAmount += partialAmount;
        
        emit ResolverAdded(resolver, partialAmount, resolverDeposit);
    }
    
    // Mark that user funds have been transferred to escrow
    bool public userFunded;
    
    function markUserFunded() external {
        require(msg.sender == factory, "Only factory");
        userFunded = true;
    }
}