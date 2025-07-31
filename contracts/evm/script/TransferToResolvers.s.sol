// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "forge-std/Script.sol";

contract TransferToResolvers is Script {
    address[] public resolverWallets = [
        0x875eF470dffF58acd5903c704DB65D50022eA994,
        0x24a330C62b739f1511Ec3D41cbfDA5fCc4DD6Ae6,
        0x6e90aB122b10fEad2cAc61c3d362B658d56a273f,
        0x62181aDd17d4b6C7303b26CE6f9A3668835c0E51
    ];

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Determine amount based on chain
        uint256 amountPerResolver;
        uint256 chainId = block.chainid;
        
        // Ethereum Sepolia: 11155111, Base Sepolia: 84532, Arbitrum Sepolia: 421614
        if (chainId == 11155111 || chainId == 84532 || chainId == 421614) {
            amountPerResolver = 0.003 ether;
        } else {
            // Monad testnet or other chains
            amountPerResolver = 0.1 ether;
        }
        
        console.log("Deployer address:", deployer);
        console.log("Amount per resolver:", amountPerResolver);
        console.log("Chain ID:", chainId);
        
        // Check deployer balance
        uint256 deployerBalance = deployer.balance;
        uint256 totalRequired = amountPerResolver * resolverWallets.length;
        
        console.log("Deployer balance:", deployerBalance);
        console.log("Total required:", totalRequired);
        
        require(deployerBalance >= totalRequired, "Insufficient balance");
        
        // Transfer to each resolver
        for (uint256 i = 0; i < resolverWallets.length; i++) {
            address resolver = resolverWallets[i];
            uint256 currentBalance = resolver.balance;
            
            console.log("Transferring to resolver", i, ":", resolver);
            console.log("Current balance:", currentBalance);
            
            (bool success, ) = payable(resolver).call{value: amountPerResolver}("");
            require(success, "Transfer failed");
            
            console.log("Transfer successful!");
        }
        
        vm.stopBroadcast();
        
        console.log("All transfers completed successfully!");
    }
}