const fs = require('fs');
const path = require('path');

/**
 * Fund Distribution Script for Tron Addresses
 * 
 * This script will help distribute TRX from a funded address to all test addresses
 * Once you have funded one address from the Shasta faucet, run this script
 */

// Load address data
function loadAddressData() {
  const addressFile = path.join(__dirname, '../tron_addresses.json');
  if (!fs.existsSync(addressFile)) {
    throw new Error('Address file not found. Run generate_simple_addresses.js first');
  }
  
  return JSON.parse(fs.readFileSync(addressFile, 'utf8'));
}

// Simple fund distribution logic (manual for now)
function distributeFunds() {
  const addressData = loadAddressData();
  
  console.log('=== TRON FUND DISTRIBUTION GUIDE ===\n');
  
  console.log('Step 1: Get Test TRX');
  console.log('- Go to: https://www.trongrid.io/shasta');
  console.log('- Request TRX for one of these addresses:\n');
  
  addressData.addresses.forEach(addr => {
    console.log(`${addr.role.toUpperCase().padEnd(10)} | Private Key: ${addr.privateKey}`);
    console.log(`${' '.repeat(10)} | NOTE: Derive real address from this private key`);
    console.log('');
  });
  
  console.log('\nStep 2: Manual Distribution (for now)');
  console.log('Since TronWeb is having issues, manually send TRX:');
  console.log('- Import private keys into TronLink wallet or TronScan');
  console.log('- Send TRX from funded address to other addresses');
  console.log('- Recommended amounts:');
  console.log('  - Deployer: 500 TRX (for contract deployment)');
  console.log('  - User: 100 TRX (for testing transactions)');
  console.log('  - Resolver: 100 TRX (for resolving auctions)');
  console.log('  - Backup: 50 TRX (for backup operations)');
  
  console.log('\nStep 3: Automated Distribution (when TronWeb works)');
  console.log('Run: node scripts/distribute_tron_funds_auto.js');
  
  console.log('\n=== VERIFICATION ===');
  console.log('After funding, verify balances by:');
  console.log('1. Checking addresses on TronScan (Shasta)');
  console.log('2. Running: node scripts/check_tron_balances.js');
  
  // Create a verification script
  createVerificationScript(addressData);
  
  // Create automated distribution script (for future use)
  createAutomatedDistributionScript(addressData);
}

function createVerificationScript(addressData) {
  const verificationScript = `// Check Tron address balances
// Run this after funding to verify all addresses have sufficient TRX

const fs = require('fs');

// This would work when TronWeb is properly configured
async function checkBalances() {
  console.log('=== TRON BALANCE CHECK ===\\n');
  
  const addresses = ${JSON.stringify(addressData.addresses, null, 2)};
  
  console.log('Manual verification steps:');
  console.log('1. Go to https://shasta.tronscan.org/');
  console.log('2. Search for each derived address');
  console.log('3. Verify TRX balance\\n');
  
  addresses.forEach(addr => {
    console.log(\`\${addr.role.toUpperCase().padEnd(10)} | Derive address from: \${addr.privateKey}\`);
  });
  
  console.log('\\nExpected minimum balances:');
  console.log('- Deployer: 500 TRX');
  console.log('- User: 100 TRX');
  console.log('- Resolver: 100 TRX');
  console.log('- Backup: 50 TRX');
}

if (require.main === module) {
  checkBalances().catch(console.error);
}

module.exports = { checkBalances };`;

  fs.writeFileSync(path.join(__dirname, 'check_tron_balances.js'), verificationScript);
  console.log('\\nCreated verification script: scripts/check_tron_balances.js');
}

function createAutomatedDistributionScript(addressData) {
  const autoScript = `// Automated TRX distribution script
// This will work when TronWeb is properly configured

const TronWeb = require('tronweb');
const fs = require('fs');

const config = {
  fullHost: 'https://api.shasta.trongrid.io',
  // Use the funder private key (should be funded from faucet)
  funderPrivateKey: '${addressData.addresses[3].privateKey}', // funder
};

const distributionAmounts = {
  deployer: 500, // TRX
  user: 100,     // TRX
  resolver: 100, // TRX
  backup: 50     // TRX
};

async function distributeAutomatically() {
  console.log('=== AUTOMATED TRX DISTRIBUTION ===\\n');
  
  try {
    const tronWeb = new TronWeb({
      fullHost: config.fullHost,
      privateKey: config.funderPrivateKey
    });
    
    const funderAddress = tronWeb.address.fromPrivateKey(config.funderPrivateKey);
    console.log('Funder address:', funderAddress);
    
    // Check funder balance
    const funderBalance = await tronWeb.trx.getBalance(funderAddress);
    console.log('Funder balance:', tronWeb.fromSun(funderBalance), 'TRX\\n');
    
    const recipients = [
      { role: 'deployer', privateKey: '${addressData.addresses[0].privateKey}', amount: distributionAmounts.deployer },
      { role: 'user', privateKey: '${addressData.addresses[1].privateKey}', amount: distributionAmounts.user },
      { role: 'resolver', privateKey: '${addressData.addresses[2].privateKey}', amount: distributionAmounts.resolver },
      { role: 'backup', privateKey: '${addressData.addresses[4].privateKey}', amount: distributionAmounts.backup }
    ];
    
    for (const recipient of recipients) {
      try {
        const recipientAddress = tronWeb.address.fromPrivateKey(recipient.privateKey);
        const amountSun = tronWeb.toSun(recipient.amount);
        
        console.log(\`Sending \${recipient.amount} TRX to \${recipient.role} (\${recipientAddress})...\`);
        
        const tx = await tronWeb.trx.sendTransaction(recipientAddress, amountSun);
        console.log(\`✅ Success! TX: \${tx.txid}\\n\`);
        
        // Wait a bit between transactions
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(\`❌ Failed to send to \${recipient.role}:\`, error.message);
      }
    }
    
    console.log('Distribution completed!');
    
  } catch (error) {
    console.error('Distribution failed:', error.message);
    console.log('\\nTry manual distribution instead.');
  }
}

if (require.main === module) {
  distributeAutomatically().catch(console.error);
}

module.exports = { distributeAutomatically };`;

  fs.writeFileSync(path.join(__dirname, 'distribute_tron_funds_auto.js'), autoScript);
  console.log('Created automated distribution script: scripts/distribute_tron_funds_auto.js');
}

// Main execution
function main() {
  try {
    distributeFunds();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { distributeFunds, loadAddressData };