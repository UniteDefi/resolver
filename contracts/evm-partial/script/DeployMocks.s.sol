// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script, console} from "forge-std/Script.sol";
import "../src/mocks/MockUSDT.sol";
import "../src/mocks/MockDAI.sol";
import "../src/mocks/MockWrappedNative.sol";

contract DeployMocks is Script {
    function run() external returns (address usdt, address dai, address wrappedNative) {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Deploy MockUSDT with 6 decimals
        MockUSDT mockUSDT = new MockUSDT("Mock USDT", "USDT", 6);
        console.log("MockUSDT:", address(mockUSDT));
        usdt = address(mockUSDT);
        
        // Deploy MockDAI with 18 decimals
        MockDAI mockDAI = new MockDAI("Mock DAI", "DAI", 18);
        console.log("MockDAI:", address(mockDAI));
        dai = address(mockDAI);
        
        // Deploy MockWrappedNative
        string memory wrappedName = getWrappedNativeName();
        string memory wrappedSymbol = getWrappedNativeSymbol();
        MockWrappedNative mockWrapped = new MockWrappedNative(wrappedName, wrappedSymbol);
        console.log("MockWrappedNative:", address(mockWrapped));
        wrappedNative = address(mockWrapped);
        
        vm.stopBroadcast();
        
        // Print deployment summary
        console.log("\n=== MOCK TOKEN DEPLOYMENT SUMMARY ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("MockUSDT:", usdt);
        console.log("MockDAI:", dai);
        console.log("MockWrappedNative:", wrappedNative);
        
        return (usdt, dai, wrappedNative);
    }
    
    function getWrappedNativeName() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 11155111) return "Wrapped Ether"; // eth_sepolia
        if (chainId == 128123) return "Wrapped XTZ"; // etherlink_testnet
        if (chainId == 10143) return "Wrapped MON"; // monad_testnet
        if (chainId == 2525) return "Wrapped INJ"; // injective_testnet (assumed chain ID)
        if (chainId == 1313161555) return "Wrapped ETH"; // aurora_testnet
        if (chainId == 97) return "Wrapped BNB"; // bnb_testnet
        if (chainId == 11155420) return "Wrapped Ether"; // op_sepolia
        if (chainId == 80002) return "Wrapped MATIC"; // polygon_amoy
        if (chainId == 534351) return "Wrapped Ether"; // scroll_sepolia
        if (chainId == 44787) return "Wrapped CELO"; // celo_alfajores
        if (chainId == 1301) return "Wrapped Ether"; // unichain_sepolia
        if (chainId == 545) return "Wrapped FLOW"; // flow_testnet
        if (chainId == 713715) return "Wrapped SEI"; // sei_testnet
        return "Wrapped Native";
    }
    
    function getWrappedNativeSymbol() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 11155111) return "WETH"; // eth_sepolia
        if (chainId == 128123) return "WXTZ"; // etherlink_testnet
        if (chainId == 10143) return "WMON"; // monad_testnet
        if (chainId == 2525) return "WINJ"; // injective_testnet
        if (chainId == 1313161555) return "WETH"; // aurora_testnet
        if (chainId == 97) return "WBNB"; // bnb_testnet
        if (chainId == 11155420) return "WETH"; // op_sepolia
        if (chainId == 80002) return "WMATIC"; // polygon_amoy
        if (chainId == 534351) return "WETH"; // scroll_sepolia
        if (chainId == 44787) return "WCELO"; // celo_alfajores
        if (chainId == 1301) return "WETH"; // unichain_sepolia
        if (chainId == 545) return "WFLOW"; // flow_testnet
        if (chainId == 713715) return "WSEI"; // sei_testnet
        return "WNATIVE";
    }
}