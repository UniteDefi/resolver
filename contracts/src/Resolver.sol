// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/**
 * @title Base Resolver Contract
 * @notice Base implementation for resolvers that integrate with 1inch cross-chain
 */
contract Resolver {
    address public immutable limitOrderProtocol;
    address public immutable escrowFactory;
    IERC20 public immutable feeToken;
    
    struct Immutables {
        address srcToken;
        uint256 srcAmount;
        address dstToken;
        uint256 dstAmount;
        address recipient;
        bytes32 hashlock;
        uint256 deadline;
    }
    
    constructor(
        address _limitOrderProtocol,
        address _escrowFactory,
        IERC20 _feeToken
    ) {
        limitOrderProtocol = _limitOrderProtocol;
        escrowFactory = _escrowFactory;
        feeToken = _feeToken;
    }
}