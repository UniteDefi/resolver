// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import "../src/UniteLimitOrderProtocol.sol";
import "../src/UniteEscrowFactory.sol";
import "../src/UniteResolver.sol";

contract DeployContracts is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Resolver wallet addresses
        address resolver0 = vm.envAddress("RESOLVER_WALLET_0");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        address resolver2 = vm.envAddress("RESOLVER_WALLET_2");
        address resolver3 = vm.envAddress("RESOLVER_WALLET_3");

        console.log("=== DEPLOYING CONTRACTS (NO MOCKS) ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("Resolver0:", resolver0);
        console.log("Resolver1:", resolver1);
        console.log("Resolver2:", resolver2);
        console.log("Resolver3:", resolver3);

        vm.startBroadcast(deployerPrivateKey);

        // Deploy Core Contracts
        UniteLimitOrderProtocol lop = new UniteLimitOrderProtocol();
        UniteEscrowFactory factory = new UniteEscrowFactory(deployer);

        // Deploy Resolver Contracts (each owned by respective resolver)
        UniteResolver resolver0Contract = new UniteResolver(
            factory,
            lop,
            resolver0
        );
        UniteResolver resolver1Contract = new UniteResolver(
            factory,
            lop,
            resolver1
        );
        UniteResolver resolver2Contract = new UniteResolver(
            factory,
            lop,
            resolver2
        );
        UniteResolver resolver3Contract = new UniteResolver(
            factory,
            lop,
            resolver3
        );

        vm.stopBroadcast();

        console.log("\n=== DEPLOYED ADDRESSES ===");
        console.log("UniteLimitOrderProtocol:", address(lop));
        console.log("UniteEscrowFactory:", address(factory));
        console.log("UniteResolver0:", address(resolver0Contract));
        console.log("UniteResolver1:", address(resolver1Contract));
        console.log("UniteResolver2:", address(resolver2Contract));
        console.log("UniteResolver3:", address(resolver3Contract));

        // Print JSON for deployments.json (without mock tokens)
        console.log("\n=== COPY TO DEPLOYMENTS.JSON ===");
        console.log('"', getChainKey(), '": {');
        console.log('  "chainId":', block.chainid, ",");
        console.log('  "name": "', getChainName(), '",');
        console.log(
            '  "UniteLimitOrderProtocol": "',
            vm.toString(address(lop)),
            '",'
        );
        console.log(
            '  "UniteEscrowFactory": "',
            vm.toString(address(factory)),
            '",'
        );
        console.log(
            '  "UniteResolver0": "',
            vm.toString(address(resolver0Contract)),
            '",'
        );
        console.log(
            '  "UniteResolver1": "',
            vm.toString(address(resolver1Contract)),
            '",'
        );
        console.log(
            '  "UniteResolver2": "',
            vm.toString(address(resolver2Contract)),
            '",'
        );
        console.log(
            '  "UniteResolver3": "',
            vm.toString(address(resolver3Contract)),
            '"'
        );
        console.log("}");

        console.log(unicode"\n✅ CONTRACT DEPLOYMENT COMPLETE");
        console.log(
            "Note: Mock tokens not deployed. Use existing tokens or deploy separately."
        );
    }

    function getChainKey() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arb_sepolia";
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 128123) return "etherlink_testnet";
        if (chainId == 10143) return "monad_testnet";
        if (chainId == 1313161555) return "aurora_testnet";
        if (chainId == 11155420) return "op_sepolia";
        if (chainId == 80002) return "polygon_amoy";
        if (chainId == 534351) return "scroll_sepolia";
        if (chainId == 44787) return "celo_alfajores";
        if (chainId == 1301) return "unichain_sepolia";
        if (chainId == 545) return "flow_testnet";
        if (chainId == 1328) return "sei_testnet";
        if (chainId == 1439) return "injective_testnet";
        return "unknown_chain";
    }

    function getChainName() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 84532) return "Base Sepolia";
        if (chainId == 421614) return "Arbitrum Sepolia";
        if (chainId == 11155111) return "Ethereum Sepolia";
        if (chainId == 128123) return "Etherlink Testnet";
        if (chainId == 10143) return "Monad Testnet";
        if (chainId == 1313161555) return "Aurora Testnet";
        if (chainId == 11155420) return "Optimism Sepolia";
        if (chainId == 80002) return "Polygon Amoy";
        if (chainId == 534351) return "Scroll Sepolia";
        if (chainId == 44787) return "Celo Alfajores";
        if (chainId == 1301) return "Unichain Sepolia";
        if (chainId == 545) return "Flow Testnet";
        if (chainId == 1328) return "Sei Testnet";
        if (chainId == 1439) return "Injective Testnet";
        return "Unknown Chain";
    }
}
