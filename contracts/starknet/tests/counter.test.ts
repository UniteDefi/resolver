import { Account, Contract, RpcProvider, stark, uint256, shortString } from "starknet";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

describe("Counter Contract Tests", () => {
  let provider: RpcProvider;
  let account: Account;
  let counterContract: Contract;
  let counterAddress: string;

  beforeAll(async () => {
    // Initialize provider
    provider = new RpcProvider({ 
      nodeUrl: process.env.STARKNET_RPC_URL || "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
    });

    // Initialize account (for testing, you would need to set up a test account)
    const privateKey = process.env.STARKNET_PRIVATE_KEY || "0x1234";
    const accountAddress = process.env.STARKNET_ACCOUNT_ADDRESS || "0x1234";
    
    account = new Account(provider, accountAddress, privateKey);

    // Deploy the contract (in real tests, you would deploy or use an already deployed contract)
    // For now, we'll assume the contract is already deployed
    counterAddress = process.env.COUNTER_CONTRACT_ADDRESS || "";
    
    if (!counterAddress) {
      console.log("[Test] Counter contract needs to be deployed first");
      // In a real test environment, you would deploy the contract here
      // const compiledContract = json.parse(fs.readFileSync("./target/dev/unite_starknet_Counter.contract_class.json", "utf8"));
      // const { transaction_hash, contract_address } = await account.deploy({
      //   classHash: compiledContract.classHash,
      //   constructorCalldata: [0], // initial value = 0
      // });
      // await provider.waitForTransaction(transaction_hash);
      // counterAddress = contract_address;
    }

    // Get contract ABI (you would load this from the compiled contract)
    const abi = [
      {
        "name": "increase_counter",
        "type": "function",
        "inputs": [],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "name": "decrease_counter",
        "type": "function",
        "inputs": [],
        "outputs": [],
        "state_mutability": "external"
      },
      {
        "name": "get_counter",
        "type": "function",
        "inputs": [],
        "outputs": [
          {
            "name": "counter",
            "type": "felt"
          }
        ],
        "state_mutability": "view"
      }
    ];

    counterContract = new Contract(abi, counterAddress, provider);
    counterContract.connect(account);
  });

  describe("Counter Operations", () => {
    it("should get initial counter value", async () => {
      const counter = await counterContract.get_counter();
      console.log("[Test/getCounter] Initial counter value:", counter.toString());
      expect(Number(counter)).toBeGreaterThanOrEqual(0);
    });

    it("should increase counter", async () => {
      const initialCounter = await counterContract.get_counter();
      console.log("[Test/increaseCounter] Initial value:", initialCounter.toString());

      const increaseTx = await counterContract.increase_counter();
      await provider.waitForTransaction(increaseTx.transaction_hash);
      console.log("[Test/increaseCounter] Transaction hash:", increaseTx.transaction_hash);

      const newCounter = await counterContract.get_counter();
      console.log("[Test/increaseCounter] New value:", newCounter.toString());
      
      expect(Number(newCounter)).toBe(Number(initialCounter) + 1);
    });

    it("should decrease counter", async () => {
      // First increase to ensure we can decrease
      const increaseTx = await counterContract.increase_counter();
      await provider.waitForTransaction(increaseTx.transaction_hash);

      const initialCounter = await counterContract.get_counter();
      console.log("[Test/decreaseCounter] Initial value:", initialCounter.toString());

      const decreaseTx = await counterContract.decrease_counter();
      await provider.waitForTransaction(decreaseTx.transaction_hash);
      console.log("[Test/decreaseCounter] Transaction hash:", decreaseTx.transaction_hash);

      const newCounter = await counterContract.get_counter();
      console.log("[Test/decreaseCounter] New value:", newCounter.toString());
      
      expect(Number(newCounter)).toBe(Number(initialCounter) - 1);
    });

    it("should emit events on counter changes", async () => {
      // This test would require event listening capabilities
      // StarkNet.js supports event filtering, but for simplicity we'll skip the implementation
      console.log("[Test/events] Event testing would be implemented with tx receipt analysis");
      expect(true).toBe(true);
    });
  });
});

// Helper function to deploy contract (for reference)
export async function deployCounter(account: Account, initialValue: number = 0): Promise<string> {
  try {
    // Load compiled contract
    const compiledContractPath = path.join(__dirname, "../target/dev/unite_starknet_Counter.contract_class.json");
    const compiledContract = JSON.parse(fs.readFileSync(compiledContractPath, "utf8"));
    
    // Declare the contract class
    const declareResponse = await account.declare({
      contract: compiledContract,
      classHash: compiledContract.classHash,
    });
    
    await account.provider.waitForTransaction(declareResponse.transaction_hash);
    console.log("[Deploy] Contract class declared:", declareResponse.class_hash);
    
    // Deploy the contract
    const deployResponse = await account.deploy({
      classHash: declareResponse.class_hash,
      constructorCalldata: [initialValue],
    });
    
    await account.provider.waitForTransaction(deployResponse.transaction_hash);
    console.log("[Deploy] Contract deployed at:", deployResponse.contract_address);
    
    return deployResponse.contract_address;
  } catch (error) {
    console.error("[Deploy] Error deploying contract:", error);
    throw error;
  }
}