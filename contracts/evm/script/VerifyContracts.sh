#!/bin/bash

# Load environment variables
source .env

# Base Sepolia contracts
echo "Verifying Base Sepolia contracts..."

# MockWrappedNative
forge verify-contract \
    --chain-id 84532 \
    --constructor-args $(cast abi-encode "constructor(string,string)" "Wrapped Ether" "WETH") \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0x7905a1B92E2808d89E211AD7dc5c2054b02F0cbd \
    src/mocks/MockWrappedNative.sol:MockWrappedNative

# MockUSDT
forge verify-contract \
    --chain-id 84532 \
    --constructor-args $(cast abi-encode "constructor(string,string,uint8)" "Mock USDT" "USDT" 6) \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0xe5D1Bd63Af1Aa6F07743cdd6F35fAD587f9665Ae \
    src/mocks/MockUSDT.sol:MockUSDT

# MockDAI
forge verify-contract \
    --chain-id 84532 \
    --constructor-args $(cast abi-encode "constructor(string,string,uint8)" "Mock DAI" "DAI" 18) \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0xC85e719998B7D44708DeF397e682Dc3291029191 \
    src/mocks/MockDAI.sol:MockDAI

# LimitOrderProtocol
forge verify-contract \
    --chain-id 84532 \
    --constructor-args "" \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0x90Ef8e79CaD875c4af20B14F22dd8b615ce762C0 \
    src/one-inch/LimitOrderProtocol.sol:LimitOrderProtocol

# EscrowFactory
forge verify-contract \
    --chain-id 84532 \
    --constructor-args $(cast abi-encode "constructor(address,address,address,address,uint256,uint256)" "0x90Ef8e79CaD875c4af20B14F22dd8b615ce762C0" "0xe5D1Bd63Af1Aa6F07743cdd6F35fAD587f9665Ae" "0xe5D1Bd63Af1Aa6F07743cdd6F35fAD587f9665Ae" "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35" 1800 1800) \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0x90A10232BCf148652aB0BC7DBFe9F7b1bC95f669 \
    src/UniteEscrowFactory.sol:UniteEscrowFactory

# Resolver contracts
forge verify-contract \
    --chain-id 84532 \
    --constructor-args $(cast abi-encode "constructor(address,address,address)" "0x90A10232BCf148652aB0BC7DBFe9F7b1bC95f669" "0x90Ef8e79CaD875c4af20B14F22dd8b615ce762C0" "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35") \
    --etherscan-api-key $ETHERSCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0xdc1FD38e89ACCd31548A9b6CE971b749fb07f52A \
    src/SimpleResolver.sol:SimpleResolver

echo "Base Sepolia verification complete!"

# Arbitrum Sepolia contracts
echo -e "\nVerifying Arbitrum Sepolia contracts..."

# MockWrappedNative
forge verify-contract \
    --chain-id 421614 \
    --constructor-args $(cast abi-encode "constructor(string,string)" "Wrapped Ether" "WETH") \
    --etherscan-api-key $ARBISCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0x3f00f779Aa61f9068A94A526526733bEBee7569A \
    src/mocks/MockWrappedNative.sol:MockWrappedNative

# MockUSDT
forge verify-contract \
    --chain-id 421614 \
    --constructor-args $(cast abi-encode "constructor(string,string,uint8)" "Mock USDT" "USDT" 6) \
    --etherscan-api-key $ARBISCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0xea6392e0a0cac24525d9CFc5D4763C79c558342C \
    src/mocks/MockUSDT.sol:MockUSDT

# MockDAI
forge verify-contract \
    --chain-id 421614 \
    --constructor-args $(cast abi-encode "constructor(string,string,uint8)" "Mock DAI" "DAI" 18) \
    --etherscan-api-key $ARBISCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0xd17384bEBE94Ff08D9231e31D2c5F1a322405a52 \
    src/mocks/MockDAI.sol:MockDAI

# LimitOrderProtocol
forge verify-contract \
    --chain-id 421614 \
    --constructor-args "" \
    --etherscan-api-key $ARBISCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0x75A3FB7529830deFBBe3EC582ca34508aDcA89Ae \
    src/one-inch/LimitOrderProtocol.sol:LimitOrderProtocol

# EscrowFactory
forge verify-contract \
    --chain-id 421614 \
    --constructor-args $(cast abi-encode "constructor(address,address,address,address,uint256,uint256)" "0x75A3FB7529830deFBBe3EC582ca34508aDcA89Ae" "0xea6392e0a0cac24525d9CFc5D4763C79c558342C" "0xea6392e0a0cac24525d9CFc5D4763C79c558342C" "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35" 1800 1800) \
    --etherscan-api-key $ARBISCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0x1BEBC69b153363525d08408C9d73B23d83BE0ae8 \
    src/UniteEscrowFactory.sol:UniteEscrowFactory

# Resolver contracts
forge verify-contract \
    --chain-id 421614 \
    --constructor-args $(cast abi-encode "constructor(address,address,address)" "0x1BEBC69b153363525d08408C9d73B23d83BE0ae8" "0x75A3FB7529830deFBBe3EC582ca34508aDcA89Ae" "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35") \
    --etherscan-api-key $ARBISCAN_API_KEY \
    --compiler-version v0.8.23+commit.f704f362 \
    0x45ca8Bf57269D128b111C145c4fAE673c06eF163 \
    src/SimpleResolver.sol:SimpleResolver

echo "Arbitrum Sepolia verification complete!"