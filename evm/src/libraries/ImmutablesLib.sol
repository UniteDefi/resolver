// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "../interfaces/IBaseEscrow.sol";

library ImmutablesLib {
    function hash(IBaseEscrow.Immutables memory immutables) internal pure returns (bytes32) {
        return keccak256(abi.encode(immutables));
    }
}