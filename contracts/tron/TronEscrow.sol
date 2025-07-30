// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

/**
 * @title TronEscrow - Simplified HTLC for Tron
 * @notice Tron-compatible escrow contract for cross-chain atomic swaps
 */
contract TronEscrow {
    struct Escrow {
        address payable seller;
        address payable buyer;
        uint256 amount;
        bytes32 hashlock;
        uint256 timelock;
        bool withdrawn;
        bool refunded;
        address token; // address(0) for TRX, otherwise TRC20 token
    }

    mapping(bytes32 => Escrow) public escrows;
    
    event EscrowCreated(
        bytes32 indexed escrowId,
        address indexed seller,
        address indexed buyer,
        uint256 amount,
        bytes32 hashlock,
        uint256 timelock
    );
    
    event EscrowWithdrawn(bytes32 indexed escrowId, bytes32 preimage);
    event EscrowRefunded(bytes32 indexed escrowId);

    modifier escrowExists(bytes32 _escrowId) {
        require(hasEscrow(_escrowId), "Escrow does not exist");
        _;
    }

    modifier hashlockMatches(bytes32 _escrowId, bytes32 _preimage) {
        require(
            escrows[_escrowId].hashlock == keccak256(abi.encodePacked(_preimage)),
            "Hashlock does not match"
        );
        _;
    }

    modifier withdrawable(bytes32 _escrowId) {
        require(escrows[_escrowId].buyer == msg.sender, "Only buyer can withdraw");
        require(escrows[_escrowId].withdrawn == false, "Already withdrawn");
        require(escrows[_escrowId].refunded == false, "Already refunded");
        require(block.timestamp <= escrows[_escrowId].timelock, "Timelock expired");
        _;
    }

    modifier refundable(bytes32 _escrowId) {
        require(escrows[_escrowId].seller == msg.sender, "Only seller can refund");
        require(escrows[_escrowId].withdrawn == false, "Already withdrawn");
        require(escrows[_escrowId].refunded == false, "Already refunded");
        require(block.timestamp > escrows[_escrowId].timelock, "Timelock not expired");
        _;
    }

    /**
     * @notice Create new escrow (TRX)
     */
    function newEscrow(
        bytes32 _escrowId,
        address payable _buyer,
        bytes32 _hashlock,
        uint256 _timelock
    ) external payable {
        require(!hasEscrow(_escrowId), "Escrow already exists");
        require(msg.value > 0, "Amount must be greater than 0");
        require(_timelock > block.timestamp, "Timelock must be in the future");

        escrows[_escrowId] = Escrow({
            seller: payable(msg.sender),
            buyer: _buyer,
            amount: msg.value,
            hashlock: _hashlock,
            timelock: _timelock,
            withdrawn: false,
            refunded: false,
            token: address(0) // TRX
        });

        emit EscrowCreated(_escrowId, msg.sender, _buyer, msg.value, _hashlock, _timelock);
    }

    /**
     * @notice Withdraw from escrow with preimage
     */
    function withdraw(bytes32 _escrowId, bytes32 _preimage)
        external
        escrowExists(_escrowId)
        hashlockMatches(_escrowId, _preimage)
        withdrawable(_escrowId)
    {
        Escrow storage escrow = escrows[_escrowId];
        escrow.withdrawn = true;
        
        escrow.buyer.transfer(escrow.amount);
        emit EscrowWithdrawn(_escrowId, _preimage);
    }

    /**
     * @notice Refund escrow after timelock expires
     */
    function refund(bytes32 _escrowId)
        external
        escrowExists(_escrowId)
        refundable(_escrowId)
    {
        Escrow storage escrow = escrows[_escrowId];
        escrow.refunded = true;
        
        escrow.seller.transfer(escrow.amount);
        emit EscrowRefunded(_escrowId);
    }

    /**
     * @notice Get escrow details
     */
    function getEscrow(bytes32 _escrowId)
        external
        view
        returns (
            address seller,
            address buyer,
            uint256 amount,
            bytes32 hashlock,
            uint256 timelock,
            bool withdrawn,
            bool refunded
        )
    {
        Escrow storage escrow = escrows[_escrowId];
        return (
            escrow.seller,
            escrow.buyer,
            escrow.amount,
            escrow.hashlock,
            escrow.timelock,
            escrow.withdrawn,
            escrow.refunded
        );
    }

    /**
     * @notice Check if escrow exists
     */
    function hasEscrow(bytes32 _escrowId) public view returns (bool) {
        return escrows[_escrowId].seller != address(0);
    }

    /**
     * @notice Get contract balance
     */
    function getContractBalance() external view returns (uint256) {
        return address(this).balance;
    }
}