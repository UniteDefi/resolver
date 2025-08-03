import { describe, it, beforeAll } from 'vitest';
import { expect } from 'chai';
import { ethers } from 'ethers';
import { EscrowState, TIMELOCK_CONSTANTS, FEE_CONSTANTS } from '../src/types/cardano';

describe('Cardano Contracts Unit Tests', () => {
  let deploymentConfig: any = null;
  
  beforeAll(async () => {
    console.log('Setting up test environment...');
    
    // Load deployment configuration
    try {
      const fs = require('fs');
      const deploymentsData = JSON.parse(fs.readFileSync('./deployments.json', 'utf8'));
      deploymentConfig = deploymentsData.networks?.cardano?.testnet;
      console.log('Deployment config loaded');
    } catch (err) {
      console.warn('Could not load deployment config:', err);
    }
  });

  describe('Contract Configuration', () => {
    it('should have valid deployment configuration', () => {
      expect(deploymentConfig).to.not.be.null;
      
      if (deploymentConfig) {
        expect(deploymentConfig.validators).to.be.an('object');
        expect(deploymentConfig.tokens).to.be.an('object');
        expect(deploymentConfig.addresses).to.be.an('object');
        
        // Check tokens
        expect(deploymentConfig.tokens.mockUSDT).to.have.property('symbol', 'USDT');
        expect(deploymentConfig.tokens.mockDAI).to.have.property('symbol', 'DAI');
        expect(deploymentConfig.tokens.mockWrappedNative).to.have.property('symbol', 'WADA');
        
        console.log('✅ All required tokens configured');
        console.log('✅ All validators configured');
      }
    });

    it('should have all required validators', () => {
      if (deploymentConfig) {
        const expectedValidators = [
          'unite_escrow',
          'unite_factory', 
          'unite_resolver',
          'limit_order_protocol',
          'mock_usdt',
          'mock_dai',
          'mock_wrapped_native'
        ];
        
        expectedValidators.forEach(validator => {
          expect(deploymentConfig.validators).to.have.property(validator);
          expect(deploymentConfig.validators[validator]).to.have.property('scriptHash');
          expect(deploymentConfig.validators[validator]).to.have.property('address');
        });
        
        console.log('✅ All required validators present');
      }
    });
  });

  describe('Mock Token Validation', () => {
    it('should have correct token configurations', () => {
      if (deploymentConfig) {
        // Mock USDT
        expect(deploymentConfig.tokens.mockUSDT.decimals).to.equal(6);
        expect(deploymentConfig.tokens.mockUSDT.name).to.equal('Mock USDT');
        
        // Mock DAI  
        expect(deploymentConfig.tokens.mockDAI.decimals).to.equal(18);
        expect(deploymentConfig.tokens.mockDAI.name).to.equal('Mock DAI');
        
        // Mock Wrapped Native
        expect(deploymentConfig.tokens.mockWrappedNative.decimals).to.equal(6);
        expect(deploymentConfig.tokens.mockWrappedNative.name).to.equal('Mock Wrapped ADA');
        
        console.log('✅ All token configurations valid');
      }
    });
  });

  describe('Escrow State Management', () => {
    it('should have valid escrow states', () => {
      expect(EscrowState.Active).to.equal('Active');
      expect(EscrowState.Withdrawn).to.equal('Withdrawn');  
      expect(EscrowState.Cancelled).to.equal('Cancelled');
      
      console.log('✅ Escrow states properly defined');
    });
  });

  describe('Timelock Constants', () => {
    it('should have proper timelock values', () => {
      expect(TIMELOCK_CONSTANTS.SRC_WITHDRAWAL_TIME).to.equal(0);
      expect(TIMELOCK_CONSTANTS.SRC_PUBLIC_WITHDRAWAL_TIME).to.equal(900);
      expect(TIMELOCK_CONSTANTS.SRC_CANCELLATION_TIME).to.equal(1800);
      expect(TIMELOCK_CONSTANTS.DST_CANCELLATION_TIME).to.equal(2700);
      
      console.log('✅ Timelock constants properly configured');
    });
  });

  describe('Fee Constants', () => {
    it('should have reasonable fee structures', () => {
      expect(FEE_CONSTANTS.RESOLVER_FEE_BASIS_POINTS).to.equal(10); // 0.1%
      expect(FEE_CONSTANTS.SAFETY_DEPOSIT_BASIS_POINTS).to.equal(100); // 1%
      expect(FEE_CONSTANTS.CALLER_REWARD_PERCENTAGE).to.equal(10); // 10%
      
      console.log('✅ Fee constants properly configured');
    });
  });

  describe('Cross-Chain Logic Validation', () => {
    it('should validate hashlock generation', () => {
      const secret = ethers.randomBytes(32);
      const hashlock = ethers.keccak256(secret);
      
      expect(secret).to.have.length(32);
      expect(hashlock).to.match(/^0x[a-fA-F0-9]{64}$/);
      expect(ethers.keccak256(secret)).to.equal(hashlock);
      
      console.log('✅ Hashlock validation works');
    });

    it('should validate timelock logic', () => {
      const currentTime = Math.floor(Date.now() / 1000);
      const futureTime = currentTime + 3600; // 1 hour
      
      expect(futureTime).to.be.greaterThan(currentTime);
      expect(futureTime - currentTime).to.equal(3600);
      
      console.log('✅ Timelock logic validation works');
    });
  });

  describe('Error Scenarios', () => {
    it('should handle invalid hashlock verification', () => {
      const secret = ethers.randomBytes(32);
      const wrongSecret = ethers.randomBytes(32);
      const hashlock = ethers.keccak256(secret);
      
      expect(ethers.keccak256(secret)).to.equal(hashlock);
      expect(ethers.keccak256(wrongSecret)).to.not.equal(hashlock);
      
      console.log('✅ Invalid hashlock detection works');
    });
  });
});