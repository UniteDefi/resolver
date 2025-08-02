// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {LimitOrderProtocol} from "../lib/cross-chain-swap/lib/limit-order-protocol/contracts/LimitOrderProtocol.sol";
import {IWETH} from "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";

contract DeployLimitOrderProtocol is Script {
    function run(address weth) external returns (address) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying LimitOrderProtocol with deployer:", deployer);
        console.log("WETH address:", weth);
        
        vm.startBroadcast(deployerPrivateKey);
        
        LimitOrderProtocol lop = new LimitOrderProtocol(IWETH(weth));
        address lopAddress = address(lop);
        
        console.log("LimitOrderProtocol deployed at:", lopAddress);
        
        vm.stopBroadcast();
        
        return lopAddress;
    }
}