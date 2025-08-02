// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IBaseEscrow {
    struct Immutables {
        bytes32 orderHash;
        bytes32 hashlock;
        uint256 maker;      // Packed address
        uint256 taker;      // Packed address  
        uint256 token;      // Packed address
        uint256 amount;
        uint256 safetyDeposit;
        uint256 timelocks;  // Packed timelocks with deployment timestamp
    }

    error NativeTokenSendingFailure();
    error InvalidImmutables();
    error InvalidSecret();
    error InvalidCaller();
    error InvalidTime();
    error AlreadyWithdrawn();
    error AlreadyCancelled();

    event Withdrawn(address indexed taker, uint256 amount);
    event Cancelled(address indexed maker, uint256 amount);
}