// SPDX-License-Identifier: MIT
pragma solidity ^0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";
import {MockUSDT} from "../src/mocks/MockUSDT.sol";
import {MockDAI} from "../src/mocks/MockDAI.sol";
import {MockWrappedNative} from "../src/mocks/MockWrappedNative.sol";
import "forge-std/StdJson.sol";

contract FundResolvers is Script {
    using stdJson for string;

    // Amount to fund each resolver
    uint256 constant USDT_AMOUNT = 10000 * 10**6;  // 10,000 USDT
    uint256 constant DAI_AMOUNT = 10000 * 10**18;  // 10,000 DAI
    uint256 constant WRAPPED_NATIVE_AMOUNT = 10 * 10**18;  // 10 WETH/WARB

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        
        // Hardcode addresses for Arbitrum Sepolia since we can't read from parent directory
        address usdtAddress;
        address daiAddress;
        address wrappedNativeAddress;
        
        if (block.chainid == 421614) { // Arbitrum Sepolia
            usdtAddress = 0x84159eadE815141727FeE309fDdaaf7BCF36cFF9;
            daiAddress = 0x79899508A267fCC3E5F838a488b7eFA2D8f32659;
            wrappedNativeAddress = 0x630b2EBcA37EeE832c1c6982858ec552afc05605;
        } else if (block.chainid == 84532) { // Base Sepolia
            usdtAddress = 0x97a2d8Dfece96252518a4327aFFf40B61A0a025A;
            daiAddress = 0x45A3AF79Ad654e75114988Abd92615eD79754eF5;
            wrappedNativeAddress = 0x67f4840a271fd6f130324F576312eCd806Cc9545;
        } else {
            revert("Chain not supported");
        }
        
        // Use the resolver addresses from env
        address[3] memory resolvers;
        resolvers[0] = 0x875eF470dffF58acd5903c704DB65D50022eA994;
        resolvers[1] = 0x24a330C62b739f1511Ec3D41cbfDA5fCc4DD6Ae6;
        resolvers[2] = 0x6e90aB122b10fEad2cAc61c3d362B658d56a273f;
        
        console.log("Funding resolvers on chain:", block.chainid);
        console.log("USDT:", usdtAddress);
        console.log("DAI:", daiAddress);
        console.log("WrappedNative:", wrappedNativeAddress);
        
        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDT usdt = MockUSDT(usdtAddress);
        MockDAI dai = MockDAI(daiAddress);
        MockWrappedNative wrappedNative = MockWrappedNative(payable(wrappedNativeAddress));
        
        // Fund each resolver
        for (uint i = 0; i < 3; i++) {
            address resolver = resolvers[i];
            console.log("\nFunding Resolver", i + 1, ":", resolver);
            
            // Mint USDT to resolver
            usdt.mint(resolver, USDT_AMOUNT);
            console.log("  Minted", USDT_AMOUNT / 10**6, "USDT");
            
            // Mint DAI to resolver
            dai.mint(resolver, DAI_AMOUNT);
            console.log("  Minted", DAI_AMOUNT / 10**18, "DAI");
            
            // Mint Wrapped Native to resolver
            wrappedNative.mint(resolver, WRAPPED_NATIVE_AMOUNT);
            console.log("  Minted", WRAPPED_NATIVE_AMOUNT / 10**18, "Wrapped Native");
        }
        
        vm.stopBroadcast();
        
        console.log("\nResolver funding complete!");
    }
    
    function getChainKey(uint256 chainId) internal pure returns (string memory) {
        if (chainId == 11155111) return "eth_sepolia";
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 421614) return "arb_sepolia";
        if (chainId == 10143) return "monad_testnet";
        revert("Unknown chain ID");
    }
}