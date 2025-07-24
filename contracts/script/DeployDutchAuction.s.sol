// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../src/SimpleDutchAuction.sol";

contract DeployDutchAuction is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        vm.startBroadcast(deployerPrivateKey);

        SimpleDutchAuction auction = new SimpleDutchAuction();
        
        console.log("SimpleDutchAuction deployed to:", address(auction));
        console.log("Chain ID:", block.chainid);

        vm.stopBroadcast();
    }
}