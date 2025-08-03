// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Script} from "forge-std/Script.sol";
import {console} from "forge-std/console.sol";

contract FundWallets is Script {
    // Usage: Set environment variables before running:
    // FUND_TARGETS="user,resolver0,resolver1" (comma-separated, or "all")
    // FUND_AMOUNT="1000000000000000000" (amount in wei, 1 ETH = 1e18)
    //
    // Examples:
    // FUND_TARGETS="all" FUND_AMOUNT="100000000000000000" forge script script/FundWallets.s.sol --broadcast
    // FUND_TARGETS="user,resolver0" FUND_AMOUNT="50000000000000000" forge script script/FundWallets.s.sol --broadcast

    function run() external {
        uint256 deployerPrivateKey = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(deployerPrivateKey);

        // Read targets and amount from environment
        string memory targets = vm.envOr("FUND_TARGETS", string("all"));
        uint256 amountWei = vm.envOr(
            "FUND_AMOUNT",
            uint256(100000000000000000)
        ); // Default 0.1 ETH

        console.log("=== FUNDING WALLETS ===");
        console.log("Chain ID:", block.chainid);
        console.log("Deployer:", deployer);
        console.log("Deployer balance (wei):", deployer.balance);
        console.log("Deployer balance (ETH):", deployer.balance / 1e18);
        console.log("Amount per wallet (wei):", amountWei);
        console.log("Amount per wallet (ETH):", amountWei / 1e18);
        console.log("Targets:", targets);

        // Parse targets and get wallet addresses
        address[] memory walletsToFund = parseTargets(targets);

        if (walletsToFund.length == 0) {
            console.log(unicode"❌ No valid targets specified");
            console.log("Valid targets: user, resolver0, resolver1, resolver2, resolver3, all");
            console.log("Set FUND_TARGETS environment variable");
            return;
        }

        // Check if deployer has enough balance
        uint256 totalRequired = walletsToFund.length * amountWei;
        if (deployer.balance < totalRequired) {
            console.log(unicode"❌ Insufficient deployer balance");
            console.log("Required (wei):", totalRequired);
            console.log("Required (ETH):", totalRequired / 1e18);
            console.log("Available (wei):", deployer.balance);
            console.log("Available (ETH):", deployer.balance / 1e18);
            return;
        }

        console.log("\n--- Wallet Details ---");
        for (uint256 i = 0; i < walletsToFund.length; i++) {
            address wallet = walletsToFund[i];
            if (wallet != address(0)) {
                console.log("Target", i);
                console.log("  Address:", wallet);
                console.log("  Balance (wei):", wallet.balance);
            }
        }

        vm.startBroadcast(deployerPrivateKey);

        // Fund each wallet
        uint256 successCount = 0;
        for (uint256 i = 0; i < walletsToFund.length; i++) {
            address wallet = walletsToFund[i];

            if (wallet == address(0)) {
                console.log(unicode"⏭️ Skipping zero address at index", i);
                continue;
            }

            uint256 balanceBefore = wallet.balance;

            (bool success, ) = wallet.call{value: amountWei}("");
            if (success) {
                uint256 balanceAfter = wallet.balance;
                console.log(unicode"✅ Funded", wallet);
                console.log("   Before (wei):", balanceBefore);
                console.log("   After (wei):", balanceAfter);
                successCount++;
            } else {
                console.log(unicode"❌ Failed to fund", wallet);
            }
        }

        vm.stopBroadcast();

        console.log(unicode"\n✅ FUNDING COMPLETE");
        console.log("Successfully funded:", successCount);
        console.log("Total wallets:", walletsToFund.length);
        console.log("Amount per wallet (wei):", amountWei);
        console.log("Amount per wallet (ETH):", amountWei / 1e18);
        console.log("Total sent (wei):", successCount * amountWei);
        console.log("Total sent (ETH):", (successCount * amountWei) / 1e18);
        console.log("Remaining deployer balance (wei):", deployer.balance);
        console.log("Remaining deployer balance (ETH):", deployer.balance / 1e18);
    }

    function parseTargets(
        string memory targets
    ) internal view returns (address[] memory) {
        // Convert to lowercase for comparison
        string memory lowerTargets = vm.toLowercase(targets);

        // Get all possible wallet addresses
        address user = getWalletAddress("user");
        address resolver0 = getWalletAddress("resolver0");
        address resolver1 = getWalletAddress("resolver1");
        address resolver2 = getWalletAddress("resolver2");
        address resolver3 = getWalletAddress("resolver3");

        // Handle "all" case
        if (keccak256(bytes(lowerTargets)) == keccak256(bytes("all"))) {
            address[] memory allWallets = new address[](5);
            allWallets[0] = user;
            allWallets[1] = resolver0;
            allWallets[2] = resolver1;
            allWallets[3] = resolver2;
            allWallets[4] = resolver3;
            console.log("Selected all wallets for funding");
            return allWallets;
        }

        // Parse comma-separated targets
        address[] memory tempWallets = new address[](5); // Max possible
        uint count = 0;

        // Check each target type
        if (contains(lowerTargets, "user") && user != address(0)) {
            tempWallets[count++] = user;
            console.log("Added user wallet:", user);
        }
        if (contains(lowerTargets, "resolver0") && resolver0 != address(0)) {
            tempWallets[count++] = resolver0;
            console.log("Added resolver0 wallet:", resolver0);
        }
        if (contains(lowerTargets, "resolver1") && resolver1 != address(0)) {
            tempWallets[count++] = resolver1;
            console.log("Added resolver1 wallet:", resolver1);
        }
        if (contains(lowerTargets, "resolver2") && resolver2 != address(0)) {
            tempWallets[count++] = resolver2;
            console.log("Added resolver2 wallet:", resolver2);
        }
        if (contains(lowerTargets, "resolver3") && resolver3 != address(0)) {
            tempWallets[count++] = resolver3;
            console.log("Added resolver3 wallet:", resolver3);
        }

        // Create result array with correct size
        address[] memory result = new address[](count);
        for (uint i = 0; i < count; i++) {
            result[i] = tempWallets[i];
        }

        return result;
    }

    function getWalletAddress(
        string memory walletType
    ) internal view returns (address) {
        bytes32 typeHash = keccak256(bytes(walletType));

        if (typeHash == keccak256(bytes("user"))) {
            try vm.envUint("PRIVATE_KEY") returns (uint256 key) {
                return vm.addr(key);
            } catch {
                console.log("Warning: PRIVATE_KEY not found for user");
                return address(0);
            }
        }

        if (typeHash == keccak256(bytes("resolver0"))) {
            try vm.envAddress("RESOLVER_WALLET_0") returns (address addr) {
                return addr;
            } catch {
                console.log("Warning: RESOLVER_WALLET_0 not found");
                return address(0);
            }
        }

        if (typeHash == keccak256(bytes("resolver1"))) {
            try vm.envAddress("RESOLVER_WALLET_1") returns (address addr) {
                return addr;
            } catch {
                console.log("Warning: RESOLVER_WALLET_1 not found");
                return address(0);
            }
        }

        if (typeHash == keccak256(bytes("resolver2"))) {
            try vm.envAddress("RESOLVER_WALLET_2") returns (address addr) {
                return addr;
            } catch {
                console.log("Warning: RESOLVER_WALLET_2 not found");
                return address(0);
            }
        }

        if (typeHash == keccak256(bytes("resolver3"))) {
            try vm.envAddress("RESOLVER_WALLET_3") returns (address addr) {
                return addr;
            } catch {
                console.log("Warning: RESOLVER_WALLET_3 not found");
                return address(0);
            }
        }

        return address(0);
    }

    function contains(
        string memory source,
        string memory target
    ) internal pure returns (bool) {
        bytes memory sourceBytes = bytes(source);
        bytes memory targetBytes = bytes(target);

        if (targetBytes.length > sourceBytes.length) return false;
        if (targetBytes.length == 0) return true;

        for (uint i = 0; i <= sourceBytes.length - targetBytes.length; i++) {
            bool found = true;
            for (uint j = 0; j < targetBytes.length; j++) {
                if (sourceBytes[i + j] != targetBytes[j]) {
                    found = false;
                    break;
                }
            }
            if (found) return true;
        }

        return false;
    }
}
