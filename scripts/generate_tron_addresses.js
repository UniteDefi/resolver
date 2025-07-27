const { TronWeb } = require('tronweb');
const fs = require('fs');
const path = require('path');

// Generate private keys and addresses for testing
function generateTronAddresses() {
  const addresses = [];
  
  // Initialize TronWeb
  const tronWeb = new TronWeb({
    fullHost: 'https://api.shasta.trongrid.io'
  });
  
  for (let i = 0; i < 5; i++) {
    // Generate random private key
    const account = tronWeb.utils.accounts.generateAccount();
    const privateKey = account.privateKey;
    const address = account.address;
    
    addresses.push({
      id: i + 1,
      role: i === 0 ? 'deployer' : i === 1 ? 'user' : i === 2 ? 'resolver' : i === 3 ? 'funder' : 'backup',
      privateKey: privateKey,
      address: address,
      hexAddress: tronWeb.address.toHex(address),
      funded: false,
      balance: 0
    });
  }
  
  return addresses;
}

// Save addresses to file
function saveAddresses(addresses) {
  const addressData = {
    network: 'shasta',
    generatedAt: new Date().toISOString(),
    addresses: addresses,
    instructions: {
      fundingAddress: addresses[3].address, // funder address
      fundingMessage: `Please send test TRX to: ${addresses[3].address}`,
      faucetUrl: 'https://www.trongrid.io/shasta',
      nextSteps: [
        '1. Fund the funder address with test TRX from the faucet',
        '2. Run `node scripts/distribute_tron_funds.js` to distribute to other addresses',
        '3. Run `tronbox compile` to compile contracts',
        '4. Run tests with `yarn test test/crosschain/TronBaseHTLC.test.js`'
      ]
    }
  };
  
  const filePath = path.join(__dirname, '../tron_addresses.json');
  fs.writeFileSync(filePath, JSON.stringify(addressData, null, 2));
  console.log('\n=== TRON ADDRESSES GENERATED ===');
  console.log(`Saved to: ${filePath}`);
  
  return addressData;
}

// Create .env template
function createEnvTemplate(addresses) {
  const envContent = `# Tron Integration Environment Variables
# Generated: ${new Date().toISOString()}

# Primary addresses
TRON_DEPLOYER_PRIVATE_KEY=${addresses[0].privateKey}
TRON_USER_PRIVATE_KEY=${addresses[1].privateKey}
TRON_RESOLVER_PRIVATE_KEY=${addresses[2].privateKey}
TRON_FUNDER_PRIVATE_KEY=${addresses[3].privateKey}

# Network configuration
TRON_SHASTA_RPC=https://api.shasta.trongrid.io
PRIVATE_KEY_SHASTA=${addresses[0].privateKey}

# Base Sepolia (add your own keys)
BASE_SEPOLIA_PRIVATE_KEY=YOUR_BASE_SEPOLIA_PRIVATE_KEY
BASE_SEPOLIA_RPC=https://sepolia.base.org

# Optional: Alchemy API key for better Base Sepolia performance
ALCHEMY_API_KEY=YOUR_ALCHEMY_API_KEY
`;

  const envPath = path.join(__dirname, '../.env.tron');
  fs.writeFileSync(envPath, envContent);
  console.log(`Environment template saved to: ${envPath}`);
}

// Main execution
function main() {
  console.log('Generating Tron addresses for testing...\n');
  
  const addresses = generateTronAddresses();
  const addressData = saveAddresses(addresses);
  createEnvTemplate(addresses);
  
  console.log('\n=== ADDRESS SUMMARY ===');
  addresses.forEach(addr => {
    console.log(`${addr.role.toUpperCase().padEnd(10)} | ${addr.address}`);
  });
  
  console.log('\n=== FUNDING INSTRUCTIONS ===');
  console.log(`1. Go to: https://www.trongrid.io/shasta`);
  console.log(`2. Fund this address: ${addresses[3].address}`);
  console.log(`3. Send at least 1000 TRX for testing`);
  console.log(`4. Run: node scripts/distribute_tron_funds.js`);
  
  console.log('\n=== NEXT STEPS ===');
  console.log('1. Copy .env.tron to .env and add your Base Sepolia keys');
  console.log('2. Fund the funder address from Shasta faucet');
  console.log('3. Distribute funds to other addresses');
  console.log('4. Compile contracts with: cd tron-contracts/tron-contracts && tronbox compile');
  console.log('5. Run tests');
  
  return addressData;
}

if (require.main === module) {
  main();
}

module.exports = { generateTronAddresses, saveAddresses, createEnvTemplate };