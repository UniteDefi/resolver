// Derive real Tron addresses from private keys
const TronWeb = require('tronweb');
const addressData = require('./tron_addresses.json');

async function deriveRealAddresses() {
  console.log('Deriving real Tron addresses from private keys...');
  
  const realAddresses = [];
  
  for (const addr of addressData.addresses) {
    try {
      // Remove 0x prefix if present
      const privateKey = addr.privateKey.replace('0x', '');
      const realAddress = TronWeb.address.fromPrivateKey(privateKey);
      
      realAddresses.push({
        ...addr,
        realAddress: realAddress,
        hexAddress: TronWeb.address.toHex(realAddress)
      });
      
      console.log(`${addr.role.toUpperCase()}: ${realAddress}`);
    } catch (error) {
      console.error(`Error deriving address for ${addr.role}:`, error.message);
    }
  }
  
  // Save with real addresses
  const updatedData = {
    ...addressData,
    realAddresses: realAddresses,
    derivedAt: new Date().toISOString()
  };
  
  require('fs').writeFileSync('./tron_addresses_real.json', JSON.stringify(updatedData, null, 2));
  console.log('Real addresses saved to tron_addresses_real.json');
  
  return realAddresses;
}

if (require.main === module) {
  deriveRealAddresses().catch(console.error);
}

module.exports = { deriveRealAddresses };