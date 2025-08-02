// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import {ChainConfig} from "./ChainConfig.sol";

contract DeployTokens is Script {
    struct TokenDeployment {
        address wrappedNative;
        address usdt;
        address dai;
    }

    function run() external returns (TokenDeployment memory deployment) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        ChainConfig config = new ChainConfig();
        ChainConfig.ChainInfo memory chainInfo = config.getChainInfo(
            block.chainid
        );

        console.log(
            "Deploying tokens on",
            chainInfo.name,
            "with deployer:",
            deployer
        );

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Wrapped Native Token
        MockWrappedNative wrappedNative = new MockWrappedNative(
            chainInfo.wrappedNativeName,
            chainInfo.wrappedNativeSymbol
        );
        deployment.wrappedNative = address(wrappedNative);
        console.log("Wrapped Native deployed at:", deployment.wrappedNative);

        // Deploy Mock USDT
        MockUSDT usdt = new MockUSDT("Mock USDT", "USDT", 6);
        deployment.usdt = address(usdt);
        console.log("Mock USDT deployed at:", deployment.usdt);

        // Deploy Mock DAI
        MockDAI dai = new MockDAI("Mock DAI", "DAI", 18);
        deployment.dai = address(dai);
        console.log("Mock DAI deployed at:", deployment.dai);

        vm.stopBroadcast();

        return deployment;
    }
}
