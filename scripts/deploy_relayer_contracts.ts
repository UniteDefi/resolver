import { ethers } from "ethers";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

dotenv.config();

const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY || process.env.PRIVATE_KEY!;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY!;

// Chain configurations
const chains = {
  baseSepolia: {
    chainId: 84532,
    name: "Base Sepolia",
    rpcUrl: `https://base-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    escrowFactory: "0xd65eB2D57FfcC321eE5D5Ac7E97C7c162a6159de"
  },
  arbitrumSepolia: {
    chainId: 421614,
    name: "Arbitrum Sepolia",
    rpcUrl: `https://arb-sepolia.g.alchemy.com/v2/${ALCHEMY_API_KEY}`,
    escrowFactory: "0x6a4499e82EeD912e27524e9fCC3a04C6821b885e"
  }
};

// Relayer contract ABI
const RELAYER_CONTRACT = `
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface IERC20 {
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);
    function approve(address spender, uint256 amount) external returns (bool);
}

contract SimpleRelayer {
    address public owner;
    mapping(address => bool) public authorizedRelayers;
    
    event UserFundsTransferred(
        address indexed user,
        address indexed token,
        uint256 amount,
        address indexed escrow
    );
    
    modifier onlyAuthorized() {
        require(authorizedRelayers[msg.sender] || msg.sender == owner, "Unauthorized");
        _;
    }
    
    constructor() {
        owner = msg.sender;
        authorizedRelayers[msg.sender] = true;
    }
    
    function authorizeRelayer(address relayer) external {
        require(msg.sender == owner, "Only owner");
        authorizedRelayers[relayer] = true;
    }
    
    function transferUserFunds(
        address user,
        address token,
        uint256 amount,
        address escrow
    ) external onlyAuthorized {
        // Transfer user's pre-approved funds to escrow
        require(IERC20(token).transferFrom(user, escrow, amount), "Transfer failed");
        
        emit UserFundsTransferred(user, token, amount, escrow);
    }
}
`;

async function deployRelayerContract(chainName: string, chainConfig: any) {
  console.log(`\n🚀 Deploying relayer contract on ${chainName}...`);
  
  const provider = new ethers.JsonRpcProvider(chainConfig.rpcUrl);
  const deployer = new ethers.Wallet(DEPLOYER_PRIVATE_KEY, provider);
  
  console.log("👤 Deployer:", deployer.address);
  
  // Check balance
  const balance = await provider.getBalance(deployer.address);
  console.log("💰 Balance:", ethers.formatEther(balance), "ETH");
  
  if (balance === 0n) {
    console.error("❌ Insufficient balance for deployment");
    return null;
  }
  
  // Deploy contract
  const factory = new ethers.ContractFactory(
    ["constructor()"],
    "0x608060405234801561001057600080fd5b50336000806101000a81548173ffffffffffffffffffffffffffffffffffffffff021916908373ffffffffffffffffffffffffffffffffffffffff1602179055506001600160003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff021916908315150217905550610583806100b86000396000f3fe608060405234801561001057600080fd5b50600436106100415760003560e01c80637a5f4e27146100465780638da5cb5b14610062578063c513169114610080575b600080fd5b610060600480360381019061005b91906102e2565b6100b0565b005b61006a610193565b604051610077919061032a565b60405180910390f35b61009a60048036038101906100959190610345565b6101b7565b6040516100a791906103ba565b60405180910390f35b6000809054906101000a900473ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff163373ffffffffffffffffffffffffffffffffffffffff1614610140576040517f08c379a000000000000000000000000000000000000000000000000000000000815260040161013790610451565b60405180910390fd5b6001600160008373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060006101000a81548160ff02191690831515021790555050565b60008054906101000a900473ffffffffffffffffffffffffffffffffffffffff1681565b6000600160003373ffffffffffffffffffffffffffffffffffffffff1673ffffffffffffffffffffffffffffffffffffffff16815260200190815260200160002060009054906101000a900460ff16806102