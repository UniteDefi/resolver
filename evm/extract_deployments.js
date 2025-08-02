const fs = require('fs');
const path = require('path');

// Chain configurations with correct key names
const chainConfigs = {
  11155111: { key: "eth_sepolia", name: "Ethereum Sepolia" },
  84532: { key: "base_sepolia", name: "Base Sepolia" },
  421614: { key: "arb_sepolia", name: "Arbitrum Sepolia" },
  10143: { key: "monad_testnet", name: "Monad Testnet" }
};

// Parse deployment file
function extractDeploymentInfo(broadcastFile) {
  try {
    const data = JSON.parse(fs.readFileSync(broadcastFile, 'utf8'));
    const contracts = {};
    
    // Extract contract deployments
    for (const tx of data.transactions) {
      if (tx.contractName && tx.contractAddress) {
        // Handle multiple deployments of the same contract type
        if (contracts[tx.contractName]) {
          // If we already have this contract, create numbered versions
          let counter = 2;
          let newName = `${tx.contractName}_${counter}`;
          while (contracts[newName]) {
            counter++;
            newName = `${tx.contractName}_${counter}`;
          }
          contracts[newName] = tx.contractAddress;
        } else {
          contracts[tx.contractName] = tx.contractAddress;
        }
      }
    }
    
    return contracts;
  } catch (error) {
    console.error(`Error parsing ${broadcastFile}:`, error.message);
    return null;
  }
}

// Initialize deployments structure
const deployments = {
  evm: {},
  aptos: {
    testnet: {
      network: "aptos-testnet",
      escrowFactory: "0x1234567890abcdef",
      relayerContract: "0xabcdef1234567890"
    }
  },
  sui: {
    testnet: {
      network: "sui-testnet",
      escrowFactory: "0x1234567890abcdef",
      relayerContract: "0xabcdef1234567890"
    }
  },
  near: {
    testnet: {
      network: "near-testnet",
      escrowFactory: "escrow-factory.testnet",
      relayerContract: "relayer.testnet"
    }
  },
  tron: {
    testnet: {
      network: "tron-shasta",
      escrowFactory: "TXYZabcdef1234567890",
      relayerContract: "TXYZabcdef0987654321"
    }
  }
};

// Process each chain's deployments
for (const [chainId, config] of Object.entries(chainConfigs)) {
  const broadcastFile = path.join(__dirname, `broadcast/DeployAll.s.sol/${chainId}/run-latest.json`);
  
  if (fs.existsSync(broadcastFile)) {
    const contracts = extractDeploymentInfo(broadcastFile);
    
    if (contracts) {
      // Add deployment data with flat structure
      deployments.evm[config.key] = {
        chainId: parseInt(chainId),
        name: config.name,
        ...contracts
      };
      
      console.log(`✓ Extracted ${config.name} deployment`);
    }
  } else {
    console.log(`✗ No deployment found for ${config.name}`);
  }
}

// Read existing deployments file to preserve any manual entries
const existingDeploymentsPath = path.join(__dirname, '../../deployments.json');
if (fs.existsSync(existingDeploymentsPath)) {
  try {
    const existingDeployments = JSON.parse(fs.readFileSync(existingDeploymentsPath, 'utf8'));
    
    // Merge with existing EVM deployments, preferring new data
    for (const [key, data] of Object.entries(existingDeployments.evm || {})) {
      if (!deployments.evm[key]) {
        deployments.evm[key] = data;
      }
    }
    
    // Preserve non-EVM chains if they have actual data
    for (const chain of ['aptos', 'sui', 'near', 'tron']) {
      if (existingDeployments[chain] && existingDeployments[chain].testnet) {
        const testnetData = existingDeployments[chain].testnet;
        // Only keep if it has real data (not placeholder addresses)
        if (testnetData.escrowFactory && !testnetData.escrowFactory.includes('1234567890abcdef')) {
          deployments[chain] = existingDeployments[chain];
        }
      }
    }
  } catch (error) {
    console.log('Could not read existing deployments file, starting fresh');
  }
}

// Save to JSON file
const outputPath = path.join(__dirname, '../../deployments.json');
fs.writeFileSync(outputPath, JSON.stringify(deployments, null, 2));

console.log(`\nDeployment summary saved to ${outputPath}`);
console.log('\nDeployment Summary:');
for (const [key, contracts] of Object.entries(deployments.evm)) {
  console.log(`\n${contracts.name} (Chain ID: ${contracts.chainId}):`);
  console.log(`  MockWrappedNative: ${contracts.MockWrappedNative || 'Not deployed'}`);
  console.log(`  MockUSDT: ${contracts.MockUSDT || 'Not deployed'}`);
  console.log(`  MockDAI: ${contracts.MockDAI || 'Not deployed'}`);
  console.log(`  LimitOrderProtocol: ${contracts.LimitOrderProtocol || 'Not deployed'}`);
  console.log(`  UniteEscrowFactory: ${contracts.UniteEscrowFactory || 'Not deployed'}`);
  console.log(`  Resolvers: ${contracts.Resolver || 'Not deployed'}, ${contracts.Resolver_2 || 'Not deployed'}, ${contracts.Resolver_3 || 'Not deployed'}, ${contracts.Resolver_4 || 'Not deployed'}`);
}