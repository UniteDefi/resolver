// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";
import "../contracts/src/RelayerService.sol";
import "../contracts/src/UniteResolverV2.sol";
import "../contracts/src/EnhancedEscrowFactory.sol";
import "../contracts/src/MockToken.sol";

contract DeployRelayerService is Script {
    
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        console.log("Deploying with address:", deployer);
        console.log("Balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy EscrowFactory
        EnhancedEscrowFactory escrowFactory = new EnhancedEscrowFactory();
        console.log("EscrowFactory deployed at:", address(escrowFactory));
        
        // Deploy RelayerService
        RelayerService relayerService = new RelayerService(address(escrowFactory));
        console.log("RelayerService deployed at:", address(relayerService));
        
        // Deploy UniteResolverV2
        UniteResolverV2 resolver = new UniteResolverV2(
            IEscrowFactory(address(escrowFactory)),
            address(0), // Mock LOP address
            deployer,
            address(relayerService)
        );
        console.log("UniteResolverV2 deployed at:", address(resolver));
        
        // Deploy test tokens
        MockToken srcToken = new MockToken("Source Token", "SRC", 18);
        MockToken dstToken = new MockToken("Destination Token", "DST", 18);
        console.log("SRC Token deployed at:", address(srcToken));
        console.log("DST Token deployed at:", address(dstToken));
        
        // Setup roles
        escrowFactory.setRelayerAuthorization(address(relayerService), true);
        relayerService.setAuthorizedResolver(deployer, true); // Deployer as resolver for testing
        
        console.log("Setup completed!");
        console.log("Chain ID:", block.chainid);
        
        vm.stopBroadcast();
        
        // Save deployment info
        string memory deploymentInfo = string.concat(
            "{\n",
            '  "chainId": ', vm.toString(block.chainid), ",\n",
            '  "escrowFactory": "', vm.toString(address(escrowFactory)), '",\n',
            '  "relayerService": "', vm.toString(address(relayerService)), '",\n',
            '  "resolver": "', vm.toString(address(resolver)), '",\n',
            '  "srcToken": "', vm.toString(address(srcToken)), '",\n',
            '  "dstToken": "', vm.toString(address(dstToken)), '",\n',
            '  "deployer": "', vm.toString(deployer), '"\n',
            "}"
        );
        
        string memory filename = string.concat("deployments_", vm.toString(block.chainid), ".json");
        vm.writeFile(filename, deploymentInfo);
        console.log("Deployment info saved to:", filename);
    }
}