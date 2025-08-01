// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Script.sol";

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function mint(address to, uint256 amount) external returns (bool);
}

contract FundResolvers is Script {
    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);
        
        // Resolver addresses from env
        address resolver1 = 0x875eF470dffF58acd5903c704DB65D50022eA994;
        address resolver2 = 0x24a330C62b739f1511Ec3D41cbfDA5fCc4DD6Ae6;
        address resolver3 = 0x6e90aB122b10fEad2cAc61c3d362B658d56a273f;
        
        console.log("Funding resolvers with deployer:", deployer);
        console.log("Deployer balance:", deployer.balance);
        
        vm.startBroadcast(deployerPrivateKey);
        
        // Send ETH to each resolver (0.1 ETH each)
        uint256 ethAmount = 0.01 ether;
        
        if (address(resolver1).balance < ethAmount) {
            payable(resolver1).transfer(ethAmount);
            console.log("Sent", ethAmount, "ETH to Resolver 1");
        }
        
        if (address(resolver2).balance < ethAmount) {
            payable(resolver2).transfer(ethAmount);
            console.log("Sent", ethAmount, "ETH to Resolver 2");
        }
        
        if (address(resolver3).balance < ethAmount) {
            payable(resolver3).transfer(ethAmount);
            console.log("Sent", ethAmount, "ETH to Resolver 3");
        }
        
        // Mint tokens if this is a testnet with mintable tokens
        address mockUSDT = getUSDTAddress();
        address mockDAI = getDAIAddress();
        address mockWrpapedNative = getNativeAddress();
        
        if (mockUSDT != address(0)) {
            try IERC20(mockUSDT).mint(resolver1, 50000 * 10**6) {
                console.log("Minted 50k USDT to Resolver 1");
            } catch {
                console.log("Could not mint USDT (not mintable)");
            }
        }
        
        if (mockDAI != address(0)) {
            try IERC20(mockDAI).mint(resolver1, 50000 * 10**18) {
                console.log("Minted 50k DAI to Resolver 1");
            } catch {
                console.log("Could not mint DAI (not mintable)");
            }
        }
        
        vm.stopBroadcast();
        
        console.log("Resolver funding complete!");
    }
    
    function getUSDTAddress() internal view returns (address) {
        uint256 chainId = block.chainid;
        if (chainId == 84532) return 0x97a2d8Dfece96252518a4327aFFf40B61A0a025A; // Base Sepolia
        if (chainId == 421614) return 0x84159eadE815141727FeE309fDdaaf7BCF36cFF9; // Arb Sepolia
        return address(0);
    }
    
    function getDAIAddress() internal view returns (address) {
        uint256 chainId = block.chainid;
        if (chainId == 84532) return 0x45A3AF79Ad654e75114988Abd92615eD79754eF5; // Base Sepolia
        if (chainId == 421614) return 0x79899508A267fCC3E5F838a488b7eFA2D8f32659; // Arb Sepolia
        return address(0);
    }

    function getNativeAddress() internal view returns (address) {
        uint256 chainId = block.chainid;
        if (chainId == 84532) return 0x45A3AF79Ad654e75114988Abd92615eD79754eF5; // Base Sepolia
        if (chainId == 421614) return 0x79899508A267fCC3E5F838a488b7eFA2D8f32659; // Arb Sepolia
        return address(0);
    }
}