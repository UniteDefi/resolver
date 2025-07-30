// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

contract ChainConfig {
    struct ChainInfo {
        string name;
        string wrappedNativeName;
        string wrappedNativeSymbol;
        address feeToken; // Will be set after DAI deployment
    }
    
    mapping(uint256 => ChainInfo) public chains;
    
    constructor() {
        // Sepolia
        chains[11155111] = ChainInfo({
            name: "Sepolia",
            wrappedNativeName: "Wrapped Ether",
            wrappedNativeSymbol: "WETH",
            feeToken: address(0)
        });
        
        // Base Sepolia
        chains[84532] = ChainInfo({
            name: "Base Sepolia",
            wrappedNativeName: "Wrapped Ether",
            wrappedNativeSymbol: "WETH",
            feeToken: address(0)
        });
        
        // Arbitrum Sepolia
        chains[421614] = ChainInfo({
            name: "Arbitrum Sepolia",
            wrappedNativeName: "Wrapped Ether",
            wrappedNativeSymbol: "WETH",
            feeToken: address(0)
        });
        
        // Etherlink Testnet
        chains[128123] = ChainInfo({
            name: "Etherlink Testnet",
            wrappedNativeName: "Wrapped XTZ",
            wrappedNativeSymbol: "WXTZ",
            feeToken: address(0)
        });
        
        // Monad Testnet
        chains[10143] = ChainInfo({
            name: "Monad Testnet",
            wrappedNativeName: "Wrapped MON",
            wrappedNativeSymbol: "WMON",
            feeToken: address(0)
        });
    }
    
    function getChainInfo(uint256 chainId) public view returns (ChainInfo memory) {
        return chains[chainId];
    }
}