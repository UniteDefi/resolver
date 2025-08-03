// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import "../src/mocks/MockUSDT.sol";
import "../src/mocks/MockDAI.sol";

contract CheckTokenDecimals is Script {
    function run() external view {
        // Read token addresses from deployments.json
        (address usdtAddr, address daiAddr) = getTokenAddressesFromDeployments();

        console.log("=== CHECKING TOKEN DECIMALS ===");
        console.log("Chain ID:", block.chainid);
        console.log("USDT Address:", usdtAddr);
        console.log("DAI Address:", daiAddr);

        if (usdtAddr != address(0)) {
            MockUSDT usdt = MockUSDT(usdtAddr);
            uint8 usdtDecimals = usdt.decimals();
            console.log("USDT Decimals:", usdtDecimals);
        }

        if (daiAddr != address(0)) {
            MockDAI dai = MockDAI(daiAddr);
            uint8 daiDecimals = dai.decimals();
            console.log("DAI Decimals:", daiDecimals);
        }
    }

    function getTokenAddressesFromDeployments() 
        internal 
        view 
        returns (address usdt, address dai) 
    {
        string memory root = vm.projectRoot();
        string memory path = string.concat(root, "/deployments.json");
        string memory json = vm.readFile(path);

        string memory chainKey = getChainKey();
        string memory evmKey = string.concat(".evm.", chainKey);

        try vm.parseJsonAddress(json, string.concat(evmKey, ".MockUSDT")) 
        returns (address _usdt) {
            usdt = _usdt;
        } catch {
            usdt = address(0);
        }

        try vm.parseJsonAddress(json, string.concat(evmKey, ".MockDAI")) 
        returns (address _dai) {
            dai = _dai;
        } catch {
            dai = address(0);
        }
    }

    function getChainKey() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 84532) return "base_sepolia";
        return "unknown_chain";
    }
}