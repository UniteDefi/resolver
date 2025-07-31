// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import {UniteEscrowFactory} from "../src/UniteEscrowFactory.sol";
import {SimpleResolver} from "../src/SimpleResolver.sol";
import {LimitOrderProtocol} from "../src/one-inch/LimitOrderProtocol.sol";
import {ISimpleOrderProtocol} from "../src/one-inch/interfaces/ISimpleOrderProtocol.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ChainConfig} from "./ChainConfig.sol";
import "forge-std/StdJson.sol";

contract DeploySimpleContracts is Script {
    using stdJson for string;

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        ChainConfig config = new ChainConfig();
        ChainConfig.ChainInfo memory chainInfo = config.getChainInfo(block.chainid);

        console.log("\n=====================================================");
        console.log("Deploying Simple Cross-Chain Contracts on", chainInfo.name);
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("=====================================================\n");

        vm.startBroadcast(deployerPrivateKey);

        // 1. Deploy Wrapped Native Token
        console.log("1. Deploying Wrapped Native Token...");
        MockWrappedNative wrappedNative = new MockWrappedNative(
            chainInfo.wrappedNativeName,
            chainInfo.wrappedNativeSymbol
        );
        console.log("   MockWrappedNative deployed at:", address(wrappedNative));

        // 2. Deploy Mock USDT
        console.log("\n2. Deploying Mock USDT...");
        MockUSDT usdt = new MockUSDT("Mock USDT", "USDT", 6);
        console.log("   MockUSDT deployed at:", address(usdt));

        // 3. Deploy Mock DAI
        console.log("\n3. Deploying Mock DAI...");
        MockDAI dai = new MockDAI("Mock DAI", "DAI", 18);
        console.log("   MockDAI deployed at:", address(dai));

        // 4. Deploy our LimitOrderProtocol
        console.log("\n4. Deploying LimitOrderProtocol...");
        LimitOrderProtocol lop = new LimitOrderProtocol();
        console.log("   LimitOrderProtocol deployed at:", address(lop));

        // 5. Deploy EscrowFactory
        console.log("\n5. Deploying EscrowFactory...");
        UniteEscrowFactory escrowFactory = new UniteEscrowFactory(
            address(lop),              // LimitOrderProtocol
            IERC20(address(usdt)),     // feeToken (using USDT but no fees will be charged)
            IERC20(address(usdt)),     // accessToken (using USDT but no access restrictions)
            deployer,                  // initialOwner
            1800,                      // rescueDelaySrc (30 minutes)
            1800                       // rescueDelayDst (30 minutes)
        );
        console.log("   EscrowFactory deployed at:", address(escrowFactory));

        // 6. Deploy 4 Resolver contracts
        console.log("\n6. Deploying Resolver contracts...");
        string[4] memory resolverNames = ["Resolver_A", "Resolver_B", "Resolver_C", "Resolver_D"];
        address[] memory resolvers = new address[](4);
        
        for (uint i = 0; i < 4; i++) {
            SimpleResolver resolver = new SimpleResolver(
                escrowFactory,
                ISimpleOrderProtocol(address(lop)),
                deployer  // Use deployer as the owner for all resolvers
            );
            resolvers[i] = address(resolver);
            console.log("  ", resolverNames[i], "deployed at:", address(resolver));
        }
        
        // 7. Authorize relayer wallet
        console.log("\n7. Authorizing relayer wallet...");
        address relayerWallet = 0x24a330C62b739f1511Ec3D41cbfDA5fCc4DD6Ae6;
        escrowFactory.authorizeRelayer(relayerWallet);
        console.log("   Authorized relayer:", relayerWallet);

        vm.stopBroadcast();

        // Print deployment summary
        console.log("\n=====================================================");
        console.log("DEPLOYMENT COMPLETE!");
        console.log("=====================================================");
        console.log("\nDeployment Summary:");
        console.log("- MockWrappedNative:", address(wrappedNative));
        console.log("- MockUSDT:", address(usdt));
        console.log("- MockDAI:", address(dai));
        console.log("- LimitOrderProtocol:", address(lop));
        console.log("- EscrowFactory:", address(escrowFactory));
        console.log("\nNext steps:");
        console.log("1. Fund resolvers with tokens and native gas");
        console.log("2. Run cross-chain swap tests");
    }
}