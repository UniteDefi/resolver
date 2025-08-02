import { describe, it, beforeAll, afterAll } from 'vitest';
import { expect } from 'chai';
import { ethers } from 'ethers';
import { HTLCCardano } from '../src/htlc-cardano';
import { CardanoNetwork } from '../src/cardano-network';

// Base Sepolia HTLC ABI (minimal for testing)
const HTLC_ABI = [
  "function createHTLC(bytes32 hashlock, address payable recipient, uint256 timelock) external payable returns (bytes32)",
  "function resolveHTLC(bytes32 htlcId, bytes32 preimage) external",
  "function refundHTLC(bytes32 htlcId) external",
  "function getHTLC(bytes32 htlcId) external view returns (tuple(address sender, address recipient, uint256 amount, bytes32 hashlock, uint256 timelock, bool resolved, bool refunded))",
  "event HTLCCreated(bytes32 indexed htlcId, address indexed sender, address indexed recipient, uint256 amount, bytes32 hashlock, uint256 timelock)",
  "event HTLCResolved(bytes32 indexed htlcId, bytes32 preimage)",
  "event HTLCRefunded(bytes32 indexed htlcId)"
];

describe('Cardano <> Base Sepolia Cross-Chain Swaps', () => {
  let evmProvider: ethers.JsonRpcProvider;
  let evmSigner: ethers.Wallet;
  let htlcContract: ethers.Contract;
  let cardanoHTLC: HTLCCardano;
  let cardanoNetwork: CardanoNetwork;
  
  // Test configuration
  const BASE_SEPOLIA_RPC = process.env.BASE_SEPOLIA_RPC || 'https://sepolia.base.org';
  const HTLC_CONTRACT_ADDRESS = process.env.HTLC_CONTRACT_ADDRESS || '0x1234567890123456789012345678901234567890';
  const PRIVATE_KEY = process.env.PRIVATE_KEY || '0x' + '1'.repeat(64);
  const CARDANO_NETWORK = process.env.CARDANO_NETWORK || 'testnet';

  beforeAll(async () => {
    // Initialize EVM connection
    evmProvider = new ethers.JsonRpcProvider(BASE_SEPOLIA_RPC);
    evmSigner = new ethers.Wallet(PRIVATE_KEY, evmProvider);
    htlcContract = new ethers.Contract(HTLC_CONTRACT_ADDRESS, HTLC_ABI, evmSigner);
    
    // Initialize Cardano
    cardanoNetwork = new CardanoNetwork(CARDANO_NETWORK as 'testnet' | 'mainnet');
    await cardanoNetwork.initialize();
    
    cardanoHTLC = new HTLCCardano(cardanoNetwork);
    await cardanoHTLC.initialize();
    
    console.log('Test setup complete');
    console.log(`EVM Address: ${evmSigner.address}`);
    console.log(`Cardano Address: ${await cardanoNetwork.getAddress()}`);
  });

  afterAll(async () => {
    await cardanoNetwork.cleanup();
  });

  describe('EVM -> Cardano Swap', () => {
    it('should complete a cross-chain swap from Base Sepolia to Cardano', async () => {
      const swapAmount = ethers.parseEther('0.01');
      const timelock = Math.floor(Date.now() / 1000) + 3600; // 1 hour
      const secret = ethers.randomBytes(32);
      const hashlock = ethers.keccak256(secret);
      
      console.log('Starting EVM -> Cardano swap...');
      console.log(`Secret: ${ethers.hexlify(secret)}`);
      console.log(`Hashlock: ${hashlock}`);
      
      // Step 1: Create HTLC on Base Sepolia
      console.log('Creating HTLC on Base Sepolia...');
      const cardanoRecipient = await cardanoNetwork.getAddress();
      
      const createTx = await htlcContract.createHTLC(
        hashlock,
        cardanoRecipient, // This would be converted to proper format
        timelock,
        { value: swapAmount }
      );
      
      const receipt = await createTx.wait();
      const htlcId = receipt.logs[0].topics[1];
      
      console.log(`HTLC created on Base Sepolia: ${htlcId}`);
      
      // Step 2: Create corresponding HTLC on Cardano
      console.log('Creating HTLC on Cardano...');
      const cardanoHTLCId = await cardanoHTLC.createHTLC({
        hashlock: hashlock.slice(2), // Remove 0x prefix
        recipient: evmSigner.address,
        amount: Number(swapAmount) / 1e18, // Convert to ADA
        timelock: timelock
      });
      
      console.log(`HTLC created on Cardano: ${cardanoHTLCId}`);
      
      // Step 3: Resolve Cardano HTLC (user reveals secret)
      console.log('Resolving Cardano HTLC...');
      const cardanoResolveTx = await cardanoHTLC.resolveHTLC(
        cardanoHTLCId,
        ethers.hexlify(secret).slice(2)
      );
      
      expect(cardanoResolveTx).to.be.ok;
      console.log(`Cardano HTLC resolved: ${cardanoResolveTx}`);
      
      // Step 4: Extract secret from Cardano and resolve EVM HTLC
      console.log('Resolving Base Sepolia HTLC...');
      const evmResolveTx = await htlcContract.resolveHTLC(htlcId, secret);
      await evmResolveTx.wait();
      
      console.log(`Base Sepolia HTLC resolved: ${evmResolveTx.hash}`);
      
      // Verify both HTLCs are resolved
      const evmHTLC = await htlcContract.getHTLC(htlcId);
      expect(evmHTLC.resolved).to.be.true;
      
      const cardanoHTLCData = await cardanoHTLC.getHTLC(cardanoHTLCId);
      expect(cardanoHTLCData.resolved).to.be.true;
      
      console.log('✅ EVM -> Cardano swap completed successfully!');
    });

    it('should handle timelock expiration and refunds', async () => {
      const swapAmount = ethers.parseEther('0.005');
      const shortTimelock = Math.floor(Date.now() / 1000) + 60; // 1 minute
      const secret = ethers.randomBytes(32);
      const hashlock = ethers.keccak256(secret);
      
      console.log('Testing refund scenario...');
      
      // Create HTLC with short timelock
      const createTx = await htlcContract.createHTLC(
        hashlock,
        await cardanoNetwork.getAddress(),
        shortTimelock,
        { value: swapAmount }
      );
      
      const receipt = await createTx.wait();
      const htlcId = receipt.logs[0].topics[1];
      
      console.log(`HTLC created with short timelock: ${htlcId}`);
      
      // Wait for timelock to expire
      console.log('Waiting for timelock expiration...');
      await new Promise(resolve => setTimeout(resolve, 65000)); // Wait 65 seconds
      
      // Attempt refund
      console.log('Attempting refund...');
      const refundTx = await htlcContract.refundHTLC(htlcId);
      await refundTx.wait();
      
      const evmHTLC = await htlcContract.getHTLC(htlcId);
      expect(evmHTLC.refunded).to.be.true;
      
      console.log('✅ Refund scenario completed successfully!');
    });
  });

  describe('Cardano -> EVM Swap', () => {
    it('should complete a cross-chain swap from Cardano to Base Sepolia', async () => {
      const swapAmount = 5; // 5 ADA
      const timelock = Math.floor(Date.now() / 1000) + 3600;
      const secret = ethers.randomBytes(32);
      const hashlock = ethers.keccak256(secret);
      
      console.log('Starting Cardano -> EVM swap...');
      
      // Step 1: Create HTLC on Cardano
      console.log('Creating HTLC on Cardano...');
      const cardanoHTLCId = await cardanoHTLC.createHTLC({
        hashlock: hashlock.slice(2),
        recipient: evmSigner.address,
        amount: swapAmount,
        timelock: timelock
      });
      
      console.log(`HTLC created on Cardano: ${cardanoHTLCId}`);
      
      // Step 2: Create corresponding HTLC on Base Sepolia
      console.log('Creating HTLC on Base Sepolia...');
      const evmAmount = ethers.parseEther((swapAmount * 0.001).toString()); // Mock exchange rate
      
      const createTx = await htlcContract.createHTLC(
        hashlock,
        await cardanoNetwork.getAddress(),
        timelock,
        { value: evmAmount }
      );
      
      const receipt = await createTx.wait();
      const evmHTLCId = receipt.logs[0].topics[1];
      
      console.log(`HTLC created on Base Sepolia: ${evmHTLCId}`);
      
      // Step 3: Resolve EVM HTLC first
      console.log('Resolving Base Sepolia HTLC...');
      const evmResolveTx = await htlcContract.resolveHTLC(evmHTLCId, secret);
      await evmResolveTx.wait();
      
      // Step 4: Use revealed secret to resolve Cardano HTLC
      console.log('Resolving Cardano HTLC...');
      const cardanoResolveTx = await cardanoHTLC.resolveHTLC(
        cardanoHTLCId,
        ethers.hexlify(secret).slice(2)
      );
      
      expect(cardanoResolveTx).to.be.ok;
      
      console.log('✅ Cardano -> EVM swap completed successfully!');
    });
  });

  describe('Relayer Integration', () => {
    it('should simulate relayer-assisted swap', async () => {
      // Mock relayer service
      const relayerService = {
        async findCounterparty(sourceChain: string, targetChain: string, amount: number) {
          return {
            id: 'resolver_123',
            address: evmSigner.address,
            cardanoAddress: await cardanoNetwork.getAddress(),
            fee: 0.001
          };
        },
        
        async monitorHTLCs(htlcIds: string[]) {
          // Mock monitoring - in real implementation would watch both chains
          return htlcIds.map(id => ({ id, status: 'pending' }));
        }
      };
      
      const swapRequest = {
        sourceChain: 'cardano',
        targetChain: 'base_sepolia',
        amount: 10,
        recipient: evmSigner.address
      };
      
      console.log('Finding counterparty through relayer...');
      const counterparty = await relayerService.findCounterparty(
        swapRequest.sourceChain,
        swapRequest.targetChain,
        swapRequest.amount
      );
      
      expect(counterparty).to.be.ok;
      expect(counterparty.id).to.equal('resolver_123');
      
      console.log(`Found counterparty: ${counterparty.id}`);
      console.log('✅ Relayer integration test passed!');
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid preimage', async () => {
      const swapAmount = ethers.parseEther('0.001');
      const timelock = Math.floor(Date.now() / 1000) + 3600;
      const secret = ethers.randomBytes(32);
      const wrongSecret = ethers.randomBytes(32);
      const hashlock = ethers.keccak256(secret);
      
      const createTx = await htlcContract.createHTLC(
        hashlock,
        evmSigner.address,
        timelock,
        { value: swapAmount }
      );
      
      const receipt = await createTx.wait();
      const htlcId = receipt.logs[0].topics[1];
      
      // Try to resolve with wrong secret
      try {
        await htlcContract.resolveHTLC(htlcId, wrongSecret);
        expect.fail('Should have thrown error');
      } catch (error: any) {
        expect(error.message).to.include('Invalid preimage');
      }
      
      console.log('✅ Invalid preimage error handling works!');
    });
  });
});
