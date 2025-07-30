const fs = require('fs');
const path = require('path');

// Parse Sepolia deployment
function extractDeploymentInfo(broadcastFile) {
    try {
        const data = JSON.parse(fs.readFileSync(broadcastFile, 'utf8'));
        const contracts = {};
        const transactions = [];
        
        // Extract contract deployments
        for (const tx of data.transactions) {
            if (tx.contractName && tx.contractAddress) {
                contracts[tx.contractName] = {
                    address: tx.contractAddress,
                    transactionHash: tx.hash,
                    deployer: tx.transaction.from,
                    gasUsed: tx.receipt ? tx.receipt.gasUsed : null
                };
                transactions.push({
                    contractName: tx.contractName,
                    address: tx.contractAddress,
                    hash: tx.hash
                });
            }
        }
        
        return {
            contracts,
            transactions,
            timestamp: data.timestamp,
            commit: data.commit
        };
    } catch (error) {
        console.error(`Error parsing ${broadcastFile}:`, error.message);
        return null;
    }
}

// Extract Sepolia deployment
const sepoliaBroadcast = 'broadcast/DeployAll.s.sol/11155111/run-latest.json';
const sepoliaDeployment = extractDeploymentInfo(sepoliaBroadcast);

// Create deployment summary
const deploymentSummary = {
    sepolia: {
        chainId: 11155111,
        chainName: "Sepolia",
        deploymentDate: new Date().toISOString(),
        contracts: {
            wrappedNative: {
                name: "WETH",
                address: "0x0361d3C7C5C1f236f507453086Cde18d12Dd76e3"
            },
            usdt: {
                name: "Mock USDT",
                address: "0x81Cc67Ed241C9Ed3142a45Eff844957de2b37877"
            },
            dai: {
                name: "Mock DAI", 
                address: "0x3096ca722E2343664f5CeAD66e1a8BdF763dD8C2"
            },
            limitOrderProtocol: {
                address: "0x03Aec373db1bd6722c0927d3B392D99bC379887D"
            },
            uniteEscrowFactory: {
                address: "0x4BdC51aDBeb6dC3462042FD4EcC1304677B5e00B"
            },
            relayerContract: {
                address: "0xc8b87cF93498D0002A21550e4B5e69016F141e7D"
            }
        },
        deployer: "0x5121aA62b1f0066c1e9d27B3b5B4E64e0c928a35",
        broadcastData: sepoliaDeployment
    }
};

// Save to JSON file
const outputPath = path.join(__dirname, 'deployments.json');
fs.writeFileSync(outputPath, JSON.stringify(deploymentSummary, null, 2));

console.log(`Deployment summary saved to ${outputPath}`);
console.log('\nSepolia Deployment Summary:');
console.log('Deployer:', deploymentSummary.sepolia.deployer);
console.log('Contracts:');
Object.entries(deploymentSummary.sepolia.contracts).forEach(([key, contract]) => {
    console.log(`  ${key}: ${contract.address}`);
});