// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title HTLCEscrow
 * @dev Hash Time Lock Contract for cross-chain atomic swaps
 * Deployed by resolver on both chains
 */
contract HTLCEscrow {
    address public token;
    uint256 public amount;
    address public sender;
    address public receiver;
    bytes32 public hashlock;
    uint256 public timelock;
    uint256 public safetyDeposit;
    bool public withdrawn;
    bool public refunded;

    event Withdrawn(address indexed by, bytes32 preimage);
    event Refunded(address indexed to);
    event Initialized(address token, uint256 amount, bytes32 hashlock);

    modifier notExecuted() {
        require(!withdrawn && !refunded, "Already executed");
        _;
    }

    // Step 5: Initialize escrow (called by resolver)
    function initialize(
        address _token,
        uint256 _amount,
        address _sender,
        address _receiver,
        bytes32 _hashlock,
        uint256 _timelock
    ) external payable {
        require(token == address(0), "Already initialized");
        require(_timelock > block.timestamp, "Invalid timelock");
        
        token = _token;
        amount = _amount;
        sender = _sender;
        receiver = _receiver;
        hashlock = _hashlock;
        timelock = _timelock;
        safetyDeposit = msg.value;

        emit Initialized(_token, _amount, _hashlock);
    }

    // Step 8: Resolver deposits funds (destination chain)
    function depositFunds() external {
        require(msg.sender == sender, "Only sender can deposit");
        require(IERC20(token).transferFrom(msg.sender, address(this), amount), "Transfer failed");
    }

    // Step 10/11: Withdraw using secret
    function withdraw(bytes32 _preimage) external notExecuted {
        require(keccak256(abi.encode(_preimage)) == hashlock, "Invalid preimage");
        
        withdrawn = true;
        
        // Transfer tokens to receiver
        IERC20(token).transfer(receiver, amount);
        
        // Return safety deposit to sender (resolver)
        if (safetyDeposit > 0) {
            payable(sender).transfer(safetyDeposit);
        }
        
        emit Withdrawn(receiver, _preimage);
    }

    // Refund after timeout
    function refund() external notExecuted {
        require(block.timestamp >= timelock, "Timelock not expired");
        require(msg.sender == sender, "Only sender can refund");
        
        refunded = true;
        
        // Return tokens to sender
        IERC20(token).transfer(sender, amount);
        
        // Return safety deposit
        if (safetyDeposit > 0) {
            payable(sender).transfer(safetyDeposit);
        }
        
        emit Refunded(sender);
    }

    // Accept safety deposit
    receive() external payable {}
}