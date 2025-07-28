// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./Escrow.sol";

contract EscrowFactory {
    event EscrowCreated(
        address indexed escrow,
        address indexed maker,
        address indexed taker,
        bytes32 hashlock,
        uint256 srcAmount,
        uint256 dstAmount
    );

    function createEscrow(
        address srcToken,
        address dstToken,
        uint256 srcAmount,
        uint256 dstAmount,
        address maker,
        address taker,
        bytes32 hashlock,
        uint256 srcChainId,
        uint256 dstChainId,
        uint256 timelock,
        uint256 safetyDeposit
    ) external returns (address escrow) {
        bytes memory bytecode = type(Escrow).creationCode;
        bytes32 salt = keccak256(abi.encode(
            maker,
            taker,
            hashlock,
            srcAmount,
            dstAmount,
            block.timestamp
        ));
        
        assembly {
            escrow := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
        }
        
        require(escrow != address(0), "Escrow creation failed");
        
        // Initialize the escrow
        Escrow(escrow).initialize(
            srcToken,
            dstToken,
            srcAmount,
            dstAmount,
            maker,
            taker,
            hashlock,
            srcChainId,
            dstChainId,
            timelock,
            safetyDeposit
        );
        
        // Transfer tokens to escrow
        IERC20(srcToken).transferFrom(msg.sender, escrow, srcAmount);
        
        emit EscrowCreated(escrow, maker, taker, hashlock, srcAmount, dstAmount);
    }

    function computeEscrowAddress(
        address maker,
        address taker,
        bytes32 hashlock,
        uint256 srcAmount,
        uint256 dstAmount,
        uint256 timestamp
    ) external view returns (address) {
        bytes32 salt = keccak256(abi.encode(
            maker,
            taker,
            hashlock,
            srcAmount,
            dstAmount,
            timestamp
        ));
        
        bytes32 hash = keccak256(abi.encodePacked(
            bytes1(0xff),
            address(this),
            salt,
            keccak256(type(Escrow).creationCode)
        ));
        
        return address(uint160(uint256(hash)));
    }
}