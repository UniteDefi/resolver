import { connect, keyStores, Contract, utils } from "near-api-js";
import { join } from "path";
import { homedir } from "os";

interface CounterContract extends Contract {
  increment(): Promise<void>;
  decrement(): Promise<void>;
  get_value(): Promise<number>;
  reset(): Promise<void>;
}

async function testContract() {
  const accountId = "unite-defi-test-1754059525.testnet";
  const contractId = accountId; // Contract is deployed to same account
  const networkId = "testnet";
  
  console.log("[Test] Setting up connection...");
  
  const keyStore = new keyStores.UnencryptedFileSystemKeyStore(
    join(homedir(), ".near-credentials")
  );
  
  const near = await connect({
    networkId,
    keyStore,
    nodeUrl: "https://rpc.testnet.near.org",
    walletUrl: "https://wallet.testnet.near.org",
    helperUrl: "https://helper.testnet.near.org",
  });
  
  const account = await near.account(accountId);
  
  const contract = new Contract(account, contractId, {
    viewMethods: ["get_value"],
    changeMethods: ["increment", "decrement", "reset"],
    useLocalViewExecution: false,
  }) as CounterContract;
  
  try {
    console.log("[Test] Getting initial value...");
    const initialValue = await contract.get_value();
    console.log("[Test] Initial value:", initialValue);
    
    console.log("[Test] Incrementing counter...");
    await contract.increment();
    
    console.log("[Test] Getting value after increment...");
    const afterIncrement = await contract.get_value();
    console.log("[Test] Value after increment:", afterIncrement);
    
    console.log("[Test] ✅ Contract is working!");
  } catch (error: any) {
    console.error("[Test] ❌ Error:", error.message);
    if (error.type === "FunctionCallError") {
      console.error("[Test] Function call error details:", error);
    }
  }
}

testContract().catch(console.error);