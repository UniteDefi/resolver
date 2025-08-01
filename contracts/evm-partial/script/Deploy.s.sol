// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import "../src/UniteLimitOrderProtocol.sol";
import "../src/UniteEscrowFactory.sol";
import "../src/UniteResolver.sol";

contract Deploy is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        address resolver0 = vm.envAddress("RESOLVER_WALLET_0");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        address resolver2 = vm.envAddress("RESOLVER_WALLET_2");
        address resolver3 = vm.envAddress("RESOLVER_WALLET_3");
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy UniteLimitOrderProtocol
        UniteLimitOrderProtocol lop = new UniteLimitOrderProtocol();
        console.log("UniteLimitOrderProtocol:", address(lop));
        
        // Deploy UniteEscrowFactory
        UniteEscrowFactory factory = new UniteEscrowFactory(deployer);
        console.log("UniteEscrowFactory:", address(factory));
        
        // Deploy 4 UniteResolver contracts
        UniteResolver resolver0Contract = new UniteResolver(factory, lop, resolver0);
        console.log("UniteResolver0:", address(resolver0Contract));
        
        UniteResolver resolver1Contract = new UniteResolver(factory, lop, resolver1);
        console.log("UniteResolver1:", address(resolver1Contract));
        
        UniteResolver resolver2Contract = new UniteResolver(factory, lop, resolver2);
        console.log("UniteResolver2:", address(resolver2Contract));
        
        UniteResolver resolver3Contract = new UniteResolver(factory, lop, resolver3);
        console.log("UniteResolver3:", address(resolver3Contract));
        
        vm.stopBroadcast();
        
        // Print deployment summary
        console.log("\n=== DEPLOYMENT SUMMARY ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
    }
}