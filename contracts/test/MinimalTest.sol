// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";

contract MinimalTest is Test {
    function testSimple() public {
        assertEq(uint256(1 + 1), uint256(2));
    }
}