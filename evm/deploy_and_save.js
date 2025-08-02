const fs = require('fs');
const { execSync } = require('child_process');

// Deployment configuration
const chains = [
    {
        name: 'sepolia',
        chainId: 11155111,
        rpcUrl: 'https://rpc.sepolia.org'
    },
    {
        name: 'base-sepolia',
        chainId: 84532,
        rpcUrl: 'https://sepolia.base.org'
    },
    {
        name: 'arbitrum-sepolia',
        chainId: 421614,
        rpcUrl: 'https://sepolia-rollup.arbitrum.io/rpc'
    },
    {
        name: 'etherlink-testnet',
        chainId: 128123,
        rpcUrl: 'https://rpc.ankr.com/etherlink_testnet'
    },
    {
        name: 'monad-testnet',
        chainId: 10143,
        rpcUrl: 'https://testnet-rpc.monad.xyz'
    }
];

const deployments = {};

// Set environment variable
process.env.DEPLOYER_PRIVATE_KEY = '0xb675b2581902a3aa8352754d766e12ea9eca766e8ba69376ac0220eb3d66fce3';

console.log('Starting deployments on all chains...\n');

for (const chain of chains) {
    console.log(`\nDeploying on ${chain.name} (Chain ID: ${chain.chainId})...`);
    
    try {
        // Run forge script
        const output = execSync(
            `forge script script/DeployAll.s.sol:DeployAll --rpc-url ${chain.rpcUrl} --broadcast --slow -vvv --chain-id ${chain.chainId} --legacy --via-ir`,
            { encoding: 'utf-8', env: process.env }
        );
        
        // Parse broadcast file
        const broadcastFile = `broadcast/DeployAll.s.sol/${chain.chainId}/run-latest.json`;
        if (fs.existsSync(broadcastFile)) {
            const broadcastData = JSON.parse(fs.readFileSync(broadcastFile, 'utf8'));
            
            // Extract deployed contracts
            const contracts = {};
            for (const tx of broadcastData.transactions) {
                if (tx.contractName) {
                    contracts[tx.contractName] = {
                        address: tx.contractAddress,
                        transactionHash: tx.hash
                    };
                }
            }
            
            deployments[chain.name] = {
                chainId: chain.chainId,
                contracts: contracts,
                timestamp: new Date().toISOString()
            };
            
            console.log(`✓ Deployment successful on ${chain.name}`);
        }
    } catch (error) {
        console.error(`✗ Deployment failed on ${chain.name}:`, error.message);
        deployments[chain.name] = {
            chainId: chain.chainId,
            error: error.message,
            timestamp: new Date().toISOString()
        };
    }
}

// Save deployments to JSON
const deploymentsPath = 'deployments.json';
fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
console.log(`\nDeployments saved to ${deploymentsPath}`);

// Display summary
console.log('\n========== DEPLOYMENT SUMMARY ==========');
for (const [chainName, deployment] of Object.entries(deployments)) {
    console.log(`\n${chainName.toUpperCase()} (Chain ID: ${deployment.chainId}):`);
    if (deployment.error) {
        console.log(`  Error: ${deployment.error}`);
    } else if (deployment.contracts) {
        for (const [contractName, contract] of Object.entries(deployment.contracts)) {
            console.log(`  ${contractName}: ${contract.address}`);
            console.log(`    TX: ${contract.transactionHash}`);
        }
    }
}