// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract Escrow {
    address public srcToken;
    address public dstToken;
    uint256 public srcAmount;
    uint256 public dstAmount;
    address public maker;
    address public taker;
    bytes32 public hashlock;
    uint256 public srcChainId;
    uint256 public dstChainId;
    uint256 public timelock;
    uint256 public safetyDeposit;
    bool public withdrawn;
    bool public refunded;

    event Withdrawn(address indexed by, bytes32 preimage);
    event Refunded(address indexed to);

    modifier notWithdrawnOrRefunded() {
        require(!withdrawn && !refunded, "Already withdrawn or refunded");
        _;
    }

    function initialize(
        address _srcToken,
        address _dstToken,
        uint256 _srcAmount,
        uint256 _dstAmount,
        address _maker,
        address _taker,
        bytes32 _hashlock,
        uint256 _srcChainId,
        uint256 _dstChainId,
        uint256 _timelock,
        uint256 _safetyDeposit
    ) external {
        require(srcToken == address(0), "Already initialized");
        
        srcToken = _srcToken;
        dstToken = _dstToken;
        srcAmount = _srcAmount;
        dstAmount = _dstAmount;
        maker = _maker;
        taker = _taker;
        hashlock = _hashlock;
        srcChainId = _srcChainId;
        dstChainId = _dstChainId;
        timelock = _timelock;
        safetyDeposit = _safetyDeposit;
    }

    function withdraw(bytes32 preimage) external notWithdrawnOrRefunded {
        require(keccak256(abi.encode(preimage)) == hashlock, "Invalid preimage");
        require(msg.sender == taker, "Only taker can withdraw");
        
        withdrawn = true;
        
        // Transfer tokens to taker
        IERC20(srcToken).transfer(taker, srcAmount);
        
        // Return safety deposit if any
        if (safetyDeposit > 0) {
            payable(taker).transfer(safetyDeposit);
        }
        
        emit Withdrawn(taker, preimage);
    }

    function refund() external notWithdrawnOrRefunded {
        require(block.timestamp >= timelock, "Timelock not expired");
        require(msg.sender == maker, "Only maker can refund");
        
        refunded = true;
        
        // Return tokens to maker
        IERC20(srcToken).transfer(maker, srcAmount);
        
        emit Refunded(maker);
    }
}