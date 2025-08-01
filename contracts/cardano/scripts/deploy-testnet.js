const fs = require('fs');
const { exec } = require('child_process');

async function deployValidators() {
  console.log('Compiling Aiken validators...');
  
  exec('aiken build', (error, stdout, stderr) => {
    if (error) {
      console.error(`Compilation error: ${error}`);
      return;
    }
    
    console.log('Validators compiled successfully!');
    console.log(stdout);
    
    // Read compiled plutus script
    try {
      const plutusScript = fs.readFileSync('./plutus.json', 'utf8');
      const compiled = JSON.parse(plutusScript);
      
      console.log('HTLC Validator compiled:');
      console.log(`Script Hash: ${compiled.validators.find(v => v.title === 'htlc')?.hash}`);
      
      // Update deployments.json with actual script hash
      const deployments = JSON.parse(fs.readFileSync('./deployments.json', 'utf8'));
      deployments.networks.cardano.testnet.validators.htlc.scriptHash = compiled.validators.find(v => v.title === 'htlc')?.hash;
      
      fs.writeFileSync('./deployments.json', JSON.stringify(deployments, null, 2));
      console.log('Updated deployments.json with script hash');
      
    } catch (err) {
      console.error('Error reading compiled script:', err);
    }
  });
}

deployValidators();
