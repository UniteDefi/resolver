// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";
import "forge-std/StdJson.sol";

contract MintTokensToResolvers is Script {
    using stdJson for string;

    // Token amounts to mint
    uint256 constant USDT_AMOUNT = 10000 * 10 ** 6; // 10,000 USDT (6 decimals)
    uint256 constant DAI_AMOUNT = 10000 * 10 ** 18; // 10,000 DAI (18 decimals)
    uint256 constant WRAPPED_AMOUNT = 10 ** 16; // 100 wrapped native tokens

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("PRIVATE_KEY");

        // Read resolver wallets from environment
        address[4] memory resolverWallets = [
            vm.envAddress("RESOLVER_WALLET_0"),
            vm.envAddress("RESOLVER_WALLET_1"),
            vm.envAddress("RESOLVER_WALLET_2"),
            vm.envAddress("RESOLVER_WALLET_3")
        ];

        // Read deployments
        string memory json = vm.readFile("deployments.json");

        // Get chain key for current chain
        string memory chainKey = getChainKey(block.chainid);

        // Get token addresses for current chain
        address usdtAddress = json.readAddress(
            string.concat(".evm.", chainKey, ".MockUSDT")
        );
        address daiAddress = json.readAddress(
            string.concat(".evm.", chainKey, ".MockDAI")
        );
        address payable wrappedNativeAddress = payable(
            json.readAddress(
                string.concat(".evm.", chainKey, ".MockWrappedNative")
            )
        );
        console.log(
            "Minting tokens to resolver wallets on chain:",
            block.chainid
        );
        console.log("USDT:", usdtAddress);
        console.log("DAI:", daiAddress);
        console.log("Wrapped Native:", wrappedNativeAddress);

        vm.startBroadcast(deployerPrivateKey);

        // Get token contracts
        MockUSDT usdt = MockUSDT(usdtAddress);
        MockDAI dai = MockDAI(daiAddress);
        MockWrappedNative wrappedNative = MockWrappedNative(
            wrappedNativeAddress
        );

        // Mint tokens to each resolver
        for (uint i = 0; i < 4; i++) {
            address resolver = resolverWallets[i];
            console.log("\nMinting to Resolver", i, ":", resolver);

            // Mint USDT
            usdt.mint(resolver, USDT_AMOUNT);
            console.log("  Minted", USDT_AMOUNT / 10 ** 6, "USDT");

            // Mint DAI
            dai.mint(resolver, DAI_AMOUNT);
            console.log("  Minted", DAI_AMOUNT / 10 ** 18, "DAI");

            // Mint Wrapped Native
            wrappedNative.deposit{value: WRAPPED_AMOUNT}();
            wrappedNative.transfer(resolver, WRAPPED_AMOUNT);
            console.log(
                "  Minted",
                WRAPPED_AMOUNT / 10 ** 16,
                "Wrapped Native"
            );
        }

        vm.stopBroadcast();

        console.log("\nToken minting completed successfully!");
        console.log("Note: Native gas tokens must be funded separately");
    }

    function getChainKey(
        uint256 chainId
    ) internal pure returns (string memory) {
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arb_sepolia";
        if (chainId == 128123) return "etherlink_testnet";
        if (chainId == 10143) return "monad_testnet";
        revert("Unknown chain ID");
    }
}
