// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "./LimitOrderProtocol.sol";
import "./Escrow.sol";

contract ResolverContract {
    address public owner;
    LimitOrderProtocol public immutable lop;
    
    event SourceEscrowDeployed(address indexed escrow, bytes32 indexed orderHash);
    event DestinationEscrowDeployed(address indexed escrow, bytes32 indexed orderHash);

    constructor(address _lop) {
        owner = msg.sender;
        lop = LimitOrderProtocol(_lop);
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    // Step 5a: Deploy source chain escrow
    function deploySrc(
        LimitOrderProtocol.CrossChainOrder calldata order,
        bytes calldata signature
    ) external payable onlyOwner returns (address srcEscrow) {
        require(msg.value >= order.safetyDeposit, "Insufficient safety deposit");
        
        // Fill order on LOP which deploys the escrow
        srcEscrow = lop.fillOrder(order, signature, address(this));
        
        // Send safety deposit to escrow
        payable(srcEscrow).transfer(order.safetyDeposit);
        
        emit SourceEscrowDeployed(srcEscrow, lop.hashOrder(order));
    }

    // Step 5b: Deploy destination chain escrow (would be on different chain)
    function deployDst(
        address dstToken,
        uint256 dstAmount,
        address maker,
        bytes32 hashlock,
        uint256 timelock,
        uint256 safetyDeposit
    ) external payable onlyOwner returns (address dstEscrow) {
        require(msg.value >= safetyDeposit, "Insufficient safety deposit");
        
        // In production, this would deploy on the destination chain
        // For now, we'll create a simple escrow
        dstEscrow = address(new Escrow());
        
        Escrow(dstEscrow).initialize(
            dstToken,
            address(0), // Not needed on dst chain
            dstAmount,
            0, // Not needed on dst chain
            maker,
            address(this), // Resolver is taker on dst chain
            hashlock,
            block.chainid,
            0, // Not needed on dst chain
            timelock,
            safetyDeposit
        );
        
        // Send safety deposit
        payable(dstEscrow).transfer(safetyDeposit);
        
        // Transfer dst tokens to escrow
        IERC20(dstToken).transferFrom(msg.sender, dstEscrow, dstAmount);
        
        emit DestinationEscrowDeployed(dstEscrow, hashlock);
    }

    // Withdraw from source escrow using secret
    function withdrawFromSrc(address escrow, bytes32 preimage) external onlyOwner {
        Escrow(escrow).withdraw(preimage);
        
        // Withdraw tokens from this contract to owner
        address token = Escrow(escrow).srcToken();
        uint256 amount = Escrow(escrow).srcAmount();
        IERC20(token).transfer(owner, amount);
    }

    // Emergency functions
    function withdrawToken(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner, amount);
    }

    function withdrawETH(uint256 amount) external onlyOwner {
        payable(owner).transfer(amount);
    }

    receive() external payable {}
}