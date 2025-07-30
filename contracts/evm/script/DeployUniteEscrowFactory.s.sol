// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {UniteEscrowFactory} from "../src/UniteEscrowFactory.sol";
import {IERC20} from "openzeppelin-contracts/contracts/token/ERC20/IERC20.sol";

contract DeployUniteEscrowFactory is Script {
    uint32 public constant RESCUE_DELAY = 691200; // 8 days
    
    function run(
        address limitOrderProtocol,
        address feeToken,
        address accessToken
    ) external returns (address) {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying UniteEscrowFactory with deployer:", deployer);
        console.log("LimitOrderProtocol:", limitOrderProtocol);
        console.log("Fee Token (DAI):", feeToken);
        console.log("Access Token:", accessToken);
        
        vm.startBroadcast(deployerPrivateKey);
        
        UniteEscrowFactory factory = new UniteEscrowFactory(
            limitOrderProtocol,
            IERC20(feeToken),
            IERC20(accessToken),
            deployer,
            RESCUE_DELAY,
            RESCUE_DELAY
        );
        
        address factoryAddress = address(factory);
        console.log("UniteEscrowFactory deployed at:", factoryAddress);
        
        vm.stopBroadcast();
        
        return factoryAddress;
    }
}