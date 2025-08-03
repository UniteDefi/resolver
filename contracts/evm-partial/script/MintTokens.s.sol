// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import "../src/mocks/MockUSDT.sol";
import "../src/mocks/MockDAI.sol";
import "../src/mocks/MockWrappedNative.sol";

contract MintTokens is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");

        // Get all wallet addresses
        address user = vm.addr(vm.envUint("TEST_USER_PRIVATE_KEY"));
        address resolver0 = vm.envAddress("RESOLVER_WALLET_0");
        address resolver1 = vm.envAddress("RESOLVER_WALLET_1");
        address resolver2 = vm.envAddress("RESOLVER_WALLET_2");
        address resolver3 = vm.envAddress("RESOLVER_WALLET_3");

        // Read token addresses from deployments.json
        (
            address usdtAddr,
            address daiAddr,
            address wrappedAddr
        ) = getTokenAddressesFromDeployments();

        console.log("=== MINTING TOKENS ===");
        console.log("Chain ID:", block.chainid);
        console.log("User:", user);
        console.log("Resolver0:", resolver0);
        console.log("Resolver1:", resolver1);
        console.log("Resolver2:", resolver2);
        console.log("Resolver3:", resolver3);
        console.log("USDT:", usdtAddr);
        console.log("DAI:", daiAddr);
        console.log("Wrapped:", wrappedAddr);

        address[] memory recipients = new address[](5);
        recipients[0] = user;
        recipients[1] = resolver0;
        recipients[2] = resolver1;
        recipients[3] = resolver2;
        recipients[4] = resolver3;

        vm.startBroadcast(deployerPrivateKey);

        // Mint amounts
        uint256 usdtAmount = 10000 * 10 ** 18; // 10k USDT
        uint256 daiAmount = 10000 * 10 ** 18; // 10k DAI
        uint256 wrappedAmount = 10 * 10 ** 18; // 10 Wrapped Native

        // Mint USDT to all recipients
        if (usdtAddr != address(0)) {
            MockUSDT usdt = MockUSDT(usdtAddr);
            for (uint i = 0; i < recipients.length; i++) {
                usdt.mint(recipients[i], usdtAmount);
            }
            console.log(
                unicode"✅ Minted",
                usdtAmount / 10 ** 18,
                "USDT to all wallets"
            );
        } else {
            console.log(unicode"❌ MockUSDT address not found in deployments.json");
        }

        // Mint DAI to all recipients
        if (daiAddr != address(0)) {
            MockDAI dai = MockDAI(daiAddr);
            for (uint i = 0; i < recipients.length; i++) {
                dai.mint(recipients[i], daiAmount);
            }
            console.log(
                unicode"✅ Minted",
                daiAmount / 10 ** 18,
                "DAI to all wallets"
            );
        } else {
            console.log(unicode"❌ MockDAI address not found in deployments.json");
        }

        // Mint Wrapped Native to all recipients
        if (wrappedAddr != address(0)) {
            MockWrappedNative wrapped = MockWrappedNative(payable(wrappedAddr));
            for (uint i = 0; i < recipients.length; i++) {
                wrapped.mint(recipients[i], wrappedAmount);
            }
            console.log(
                unicode"✅ Minted",
                wrappedAmount / 10 ** 18,
                "Wrapped Native to all wallets"
            );
        } else {
            console.log(
                unicode"❌ MockWrappedNative address not found in deployments.json"
            );
        }

        vm.stopBroadcast();

        console.log(unicode"\n✅ TOKEN MINTING COMPLETE");
        console.log("All wallets received:");
        console.log("- 10,000 USDT");
        console.log("- 10,000 DAI");
        console.log("- 10 Wrapped Native");
    }

    function getTokenAddressesFromDeployments()
        internal
        view
        returns (address usdt, address dai, address wrapped)
    {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/deployments.json");
        string memory json = vm.readFile(path);

        string memory chainKey = getChainKey();
        string memory evmKey = string.concat(".evm.", chainKey);

        // Try to read token addresses, return zero address if not found
        try
            vm.parseJsonAddress(json, string.concat(evmKey, ".MockUSDT"))
        returns (address _usdt) {
            usdt = _usdt;
        } catch {
            console.log("MockUSDT not found for chain:", chainKey);
            usdt = address(0);
        }

        try
            vm.parseJsonAddress(json, string.concat(evmKey, ".MockDAI"))
        returns (address _dai) {
            dai = _dai;
        } catch {
            console.log("MockDAI not found for chain:", chainKey);
            dai = address(0);
        }

        try
            vm.parseJsonAddress(
                json,
                string.concat(evmKey, ".MockWrappedNative")
            )
        returns (address _wrapped) {
            wrapped = _wrapped;
        } catch {
            console.log("MockWrappedNative not found for chain:", chainKey);
            wrapped = address(0);
        }

        return (usdt, dai, wrapped);
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
        revert(string.concat("Unsupported chain ID: ", vm.toString(chainId)));
    }
}
