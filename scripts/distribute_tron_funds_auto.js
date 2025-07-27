// Automated TRX distribution script
// This will work when TronWeb is properly configured

const TronWeb = require('tronweb');
const fs = require('fs');

const config = {
  fullHost: 'https://api.shasta.trongrid.io',
  // Use the funder private key (should be funded from faucet)
  funderPrivateKey: '0xe12df518151de89649735c1ba2c111642b645147fe7268667ae9bbec395ab8b2', // funder
};

const distributionAmounts = {
  deployer: 500, // TRX
  user: 100,     // TRX
  resolver: 100, // TRX
  backup: 50     // TRX
};

async function distributeAutomatically() {
  console.log('=== AUTOMATED TRX DISTRIBUTION ===\n');
  
  try {
    const tronWeb = new TronWeb({
      fullHost: config.fullHost,
      privateKey: config.funderPrivateKey
    });
    
    const funderAddress = tronWeb.address.fromPrivateKey(config.funderPrivateKey);
    console.log('Funder address:', funderAddress);
    
    // Check funder balance
    const funderBalance = await tronWeb.trx.getBalance(funderAddress);
    console.log('Funder balance:', tronWeb.fromSun(funderBalance), 'TRX\n');
    
    const recipients = [
      { role: 'deployer', privateKey: '0x721d42dad575a4d4a6a7d2894ad8aab11c406fe30a51a65641d7ece65c32dcd6', amount: distributionAmounts.deployer },
      { role: 'user', privateKey: '0x4a8d94045abaed7d0ceb1dc401432edefe410a15429d8b0c81ad1e41864e981e', amount: distributionAmounts.user },
      { role: 'resolver', privateKey: '0x1b3a4d42a0612eea386c5ba4e85221ec451705934a3d03dce4f766a86aebb4da', amount: distributionAmounts.resolver },
      { role: 'backup', privateKey: '0xab7faa5bfb8e4bd70b80f71c29e249d9a9bafa779a9746d0de38dfef721b4f21', amount: distributionAmounts.backup }
    ];
    
    for (const recipient of recipients) {
      try {
        const recipientAddress = tronWeb.address.fromPrivateKey(recipient.privateKey);
        const amountSun = tronWeb.toSun(recipient.amount);
        
        console.log(`Sending ${recipient.amount} TRX to ${recipient.role} (${recipientAddress})...`);
        
        const tx = await tronWeb.trx.sendTransaction(recipientAddress, amountSun);
        console.log(`✅ Success! TX: ${tx.txid}\n`);
        
        // Wait a bit between transactions
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`❌ Failed to send to ${recipient.role}:`, error.message);
      }
    }
    
    console.log('Distribution completed!');
    
  } catch (error) {
    console.error('Distribution failed:', error.message);
    console.log('\nTry manual distribution instead.');
  }
}

if (require.main === module) {
  distributeAutomatically().catch(console.error);
}

module.exports = { distributeAutomatically };