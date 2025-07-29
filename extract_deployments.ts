import fs from "fs";
import path from "path";

interface Deployment {
  contractName: string;
  contractAddress: string;
}

interface ChainDeployments {
  [contractName: string]: string;
}

interface AllDeployments {
  [chainId: string]: ChainDeployments;
}

const broadcastDir = path.join(__dirname, "broadcast", "DeployAll.s.sol");
const chainDirs = fs.readdirSync(broadcastDir).filter(dir => {
  const fullPath = path.join(broadcastDir, dir);
  return fs.statSync(fullPath).isDirectory();
});

const deployments: AllDeployments = {};

chainDirs.forEach(chainId => {
  const latestFile = path.join(broadcastDir, chainId, "run-latest.json");
  
  if (fs.existsSync(latestFile)) {
    const fileContent = fs.readFileSync(latestFile, "utf8");
    const data = JSON.parse(fileContent);
    
    if (!deployments[chainId]) {
      deployments[chainId] = {};
    }
    
    data.transactions.forEach((tx: any) => {
      if (tx.contractName && tx.contractAddress) {
        const contractName = tx.contractName;
        const address = tx.contractAddress;
        
        // Handle multiple deployments of same contract (like Resolver)
        if (deployments[chainId][contractName]) {
          // Add a suffix for multiple deployments
          let counter = 2;
          let newName = `${contractName}_${counter}`;
          while (deployments[chainId][newName]) {
            counter++;
            newName = `${contractName}_${counter}`;
          }
          deployments[chainId][newName] = address;
        } else {
          deployments[chainId][contractName] = address;
        }
      }
    });
  }
});

// Add chain names for better readability
const chainNames: { [key: string]: string } = {
  "11155111": "Sepolia",
  "421614": "Arbitrum Sepolia",
  "84532": "Base Sepolia",
  "10143": "Matchain Sepolia"
};

const deploymentsWithNames: any = {};
Object.entries(deployments).forEach(([chainId, contracts]) => {
  const chainName = chainNames[chainId] || `Chain ${chainId}`;
  deploymentsWithNames[`${chainId} (${chainName})`] = contracts;
});

// Write to file
fs.writeFileSync(
  path.join(__dirname, "all_deployments.json"),
  JSON.stringify(deploymentsWithNames, null, 2)
);

console.log("Deployments extracted successfully!");
console.log(JSON.stringify(deploymentsWithNames, null, 2));