// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

/**
 * @title SimpleEscrow - Basic HTLC escrow
 */
contract SimpleEscrow {
    struct EscrowData {
        bytes32 orderId;
        uint256 amount;
        address depositor;
        address beneficiary;
        bytes32 hashlock;
        uint256 timelock;
        bool withdrawn;
        bool refunded;
    }
    
    mapping(bytes32 => EscrowData) public escrows;
    
    event EscrowCreated(bytes32 indexed orderId, uint256 amount, bytes32 hashlock);
    event EscrowWithdrawn(bytes32 indexed orderId, bytes32 preimage);
    event EscrowRefunded(bytes32 indexed orderId);
    
    function createEscrow(
        bytes32 orderId,
        address beneficiary,
        bytes32 hashlock,
        uint256 timelock
    ) external payable {
        require(msg.value > 0, "No value sent");
        require(escrows[orderId].depositor == address(0), "Escrow exists");
        
        escrows[orderId] = EscrowData({
            orderId: orderId,
            amount: msg.value,
            depositor: msg.sender,
            beneficiary: beneficiary,
            hashlock: hashlock,
            timelock: timelock,
            withdrawn: false,
            refunded: false
        });
        
        emit EscrowCreated(orderId, msg.value, hashlock);
    }
    
    function withdraw(bytes32 orderId, bytes32 preimage) external {
        EscrowData storage escrow = escrows[orderId];
        require(msg.sender == escrow.beneficiary, "Not beneficiary");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.refunded, "Already refunded");
        require(block.timestamp <= escrow.timelock, "Timelock expired");
        require(keccak256(abi.encodePacked(preimage)) == escrow.hashlock, "Invalid secret");
        
        escrow.withdrawn = true;
        payable(escrow.beneficiary).transfer(escrow.amount);
        
        emit EscrowWithdrawn(orderId, preimage);
    }
    
    function refund(bytes32 orderId) external {
        EscrowData storage escrow = escrows[orderId];
        require(msg.sender == escrow.depositor, "Not depositor");
        require(!escrow.withdrawn, "Already withdrawn");
        require(!escrow.refunded, "Already refunded");
        require(block.timestamp > escrow.timelock, "Timelock not expired");
        
        escrow.refunded = true;
        payable(escrow.depositor).transfer(escrow.amount);
        
        emit EscrowRefunded(orderId);
    }
    
    function getEscrow(bytes32 orderId) external view returns (EscrowData memory) {
        return escrows[orderId];
    }
    
    function isValidSecret(bytes32 orderId, bytes32 preimage) external view returns (bool) {
        return keccak256(abi.encodePacked(preimage)) == escrows[orderId].hashlock;
    }
}