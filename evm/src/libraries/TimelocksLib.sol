// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

library TimelocksLib {
    uint256 private constant _TIMELOCK_MASK = 0xffffffff;
    uint256 private constant _DEPLOYED_AT_OFFSET = 224;

    function setDeployedAt(uint256 timelocks, uint256 timestamp) internal pure returns (uint256) {
        return (timelocks & ~(uint256(0xffffffff) << _DEPLOYED_AT_OFFSET)) | (timestamp << _DEPLOYED_AT_OFFSET);
    }

    function getDeployedAt(uint256 timelocks) internal pure returns (uint32) {
        return uint32(timelocks >> _DEPLOYED_AT_OFFSET);
    }

    function srcWithdrawal(uint256 timelocks) internal pure returns (uint32) {
        return uint32(timelocks & _TIMELOCK_MASK);
    }

    function srcPublicWithdrawal(uint256 timelocks) internal pure returns (uint32) {
        return uint32((timelocks >> 32) & _TIMELOCK_MASK);
    }

    function srcCancellation(uint256 timelocks) internal pure returns (uint32) {
        return uint32((timelocks >> 64) & _TIMELOCK_MASK);
    }

    function srcPublicCancellation(uint256 timelocks) internal pure returns (uint32) {
        return uint32((timelocks >> 96) & _TIMELOCK_MASK);
    }

    function dstWithdrawal(uint256 timelocks) internal pure returns (uint32) {
        return uint32((timelocks >> 128) & _TIMELOCK_MASK);
    }

    function dstPublicWithdrawal(uint256 timelocks) internal pure returns (uint32) {
        return uint32((timelocks >> 160) & _TIMELOCK_MASK);
    }

    function dstCancellation(uint256 timelocks) internal pure returns (uint32) {
        return uint32((timelocks >> 192) & _TIMELOCK_MASK);
    }
}