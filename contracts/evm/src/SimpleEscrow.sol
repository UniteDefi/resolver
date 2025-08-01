// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./interfaces/IEscrow.sol";
import "./interfaces/IBaseEscrow.sol";
import "./libraries/TimelocksLib.sol";

contract SimpleEscrow is IEscrow, IBaseEscrow, ReentrancyGuard {
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
    uint256 public amount;
    uint256 public safetyDeposit;
    uint256 public timelocks;
    bool public isSource;
    uint256 public srcCancellationTimestamp; // Only used for destination escrows

    // Modifiers
    modifier onlyActive() {
        if (state != State.Active) revert InvalidTime();
        _;
    }

    // Initialize for source escrow
    function initialize(Immutables calldata immutables, bool _isSource) external payable {
        require(orderHash == bytes32(0), "Already initialized");
        require(msg.value >= immutables.safetyDeposit, "Insufficient safety deposit");
        
        orderHash = immutables.orderHash;
        hashlock = immutables.hashlock;
        maker = address(uint160(immutables.maker));
        taker = address(uint160(immutables.taker));
        token = address(uint160(immutables.token));
        amount = immutables.amount;
        safetyDeposit = immutables.safetyDeposit;
        timelocks = TimelocksLib.setDeployedAt(immutables.timelocks, block.timestamp);
        isSource = _isSource;
        state = State.Active;
    }

    // Initialize for destination escrow
    function initializeDst(Immutables calldata immutables, uint256 _srcCancellationTimestamp) external payable {
        require(orderHash == bytes32(0), "Already initialized");
        require(msg.value >= immutables.safetyDeposit, "Insufficient safety deposit");
        
        orderHash = immutables.orderHash;
        hashlock = immutables.hashlock;
        maker = address(uint160(immutables.maker));
        taker = address(uint160(immutables.taker));
        token = address(uint160(immutables.token));
        amount = immutables.amount;
        safetyDeposit = immutables.safetyDeposit;
        timelocks = TimelocksLib.setDeployedAt(immutables.timelocks, block.timestamp);
        isSource = false;
        srcCancellationTimestamp = _srcCancellationTimestamp;
        state = State.Active;
    }

    function withdraw(bytes32 secret, Immutables calldata immutables) external override nonReentrant onlyActive {
        // Verify secret
        if (keccak256(abi.encodePacked(secret)) != hashlock) revert InvalidSecret();
        
        // Verify immutables match
        _verifyImmutables(immutables);
        
        // Check withdrawal time windows
        uint256 deployedAt = timelocks.getDeployedAt();
        uint256 currentTime = block.timestamp;
        
        if (isSource) {
            // Source chain withdrawal
            uint256 withdrawalTime = deployedAt + timelocks.srcWithdrawal();
            uint256 publicWithdrawalTime = deployedAt + timelocks.srcPublicWithdrawal();
            
            // Taker can withdraw after withdrawal time
            // Anyone can withdraw after public withdrawal time
            if (currentTime < withdrawalTime) revert InvalidTime();
            if (currentTime < publicWithdrawalTime && msg.sender != taker) revert InvalidCaller();
        } else {
            // Destination chain withdrawal
            uint256 withdrawalTime = deployedAt + timelocks.dstWithdrawal();
            uint256 publicWithdrawalTime = deployedAt + timelocks.dstPublicWithdrawal();
            
            // Maker can withdraw after withdrawal time
            // Anyone can withdraw after public withdrawal time
            if (currentTime < withdrawalTime) revert InvalidTime();
            if (currentTime < publicWithdrawalTime && msg.sender != maker) revert InvalidCaller();
        }
        
        state = State.Withdrawn;
        
        // Transfer tokens
        address recipient = isSource ? taker : maker;
        
        if (token == address(0)) {
            // Native token
            uint256 totalAmount = amount + safetyDeposit;
            (bool success,) = recipient.call{value: totalAmount}("");
            if (!success) revert NativeTokenSendingFailure();
        } else {
            // ERC20 token
            IERC20(token).safeTransfer(recipient, amount);
            
            // Return safety deposit
            (bool success,) = recipient.call{value: safetyDeposit}("");
            if (!success) revert NativeTokenSendingFailure();
        }
        
        emit Withdrawn(recipient, amount);
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
            
            // Taker can cancel after cancellation time
            if (currentTime < cancellationTime) revert InvalidTime();
            if (msg.sender != taker) revert InvalidCaller();
        }
        
        state = State.Cancelled;
        
        // Return funds to original sender
        address recipient = isSource ? maker : taker;
        
        if (token == address(0)) {
            // Native token
            uint256 totalAmount = amount + safetyDeposit;
            (bool success,) = recipient.call{value: totalAmount}("");
            if (!success) revert NativeTokenSendingFailure();
        } else {
            // ERC20 token
            IERC20(token).safeTransfer(recipient, amount);
            
            // Return safety deposit
            (bool success,) = recipient.call{value: safetyDeposit}("");
            if (!success) revert NativeTokenSendingFailure();
        }
        
        emit Cancelled(recipient, amount);
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

    // Allow receiving tokens and ETH
    receive() external payable {}
}