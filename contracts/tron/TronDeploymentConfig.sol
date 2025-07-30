// SPDX-License-Identifier: MIT

pragma solidity 0.8.23;

/**
 * @title Tron Deployment Configuration
 * @notice Contains Tron-specific configurations and helpers
 */
library TronDeploymentConfig {
    // Tron chain ID
    uint256 constant TRON_CHAIN_ID = 728126428; // Tron Mainnet
    uint256 constant TRON_TESTNET_CHAIN_ID = 0x94a9059e; // Tron Testnet (Shasta)
    
    // Native token decimals (TRX uses 6 decimals)
    uint8 constant TRX_DECIMALS = 6;
    
    // Common TRC20 token addresses on Tron
    address constant USDT_TRON = 0xa614f803B6FD780986A42c78Ec9c7f77e6DeD13C; // USDT on Tron
    address constant USDC_TRON = 0x3487b63D30B5B2C87fb7fFa8bcfADE38EAaC1abc; // USDC on Tron
    
    // Timelock configurations (in seconds)
    uint32 constant SRC_WITHDRAWAL_DELAY = 300; // 5 minutes
    uint32 constant SRC_PUBLIC_WITHDRAWAL_DELAY = 600; // 10 minutes
    uint32 constant SRC_CANCELLATION_DELAY = 900; // 15 minutes
    uint32 constant SRC_PUBLIC_CANCELLATION_DELAY = 1200; // 20 minutes
    
    uint32 constant DST_WITHDRAWAL_DELAY = 300; // 5 minutes
    uint32 constant DST_PUBLIC_WITHDRAWAL_DELAY = 600; // 10 minutes
    uint32 constant DST_CANCELLATION_DELAY = 900; // 15 minutes
    
    // Rescue delays
    uint32 constant RESCUE_DELAY_SRC = 86400; // 24 hours
    uint32 constant RESCUE_DELAY_DST = 86400; // 24 hours
    
    // Safety deposit amounts (in TRX)
    uint256 constant DEFAULT_SAFETY_DEPOSIT = 10 * 10**TRX_DECIMALS; // 10 TRX
    
    /**
     * @notice Encode timelocks for escrow deployment
     * @param deployedAt Deployment timestamp
     * @return Encoded timelocks
     */
    function encodeTimelocks(uint32 deployedAt) internal pure returns (uint256) {
        uint256 timelocks = uint256(deployedAt) << 224;
        timelocks |= uint256(SRC_WITHDRAWAL_DELAY);
        timelocks |= uint256(SRC_PUBLIC_WITHDRAWAL_DELAY) << 32;
        timelocks |= uint256(SRC_CANCELLATION_DELAY) << 64;
        timelocks |= uint256(SRC_PUBLIC_CANCELLATION_DELAY) << 96;
        timelocks |= uint256(DST_WITHDRAWAL_DELAY) << 128;
        timelocks |= uint256(DST_PUBLIC_WITHDRAWAL_DELAY) << 160;
        timelocks |= uint256(DST_CANCELLATION_DELAY) << 192;
        return timelocks;
    }
    
    /**
     * @notice Convert TRX amount to sun (smallest unit)
     * @param trxAmount Amount in TRX
     * @return Amount in sun
     */
    function toSun(uint256 trxAmount) internal pure returns (uint256) {
        return trxAmount * 10**TRX_DECIMALS;
    }
    
    /**
     * @notice Convert sun amount to TRX
     * @param sunAmount Amount in sun
     * @return Amount in TRX
     */
    function toTrx(uint256 sunAmount) internal pure returns (uint256) {
        return sunAmount / 10**TRX_DECIMALS;
    }
}