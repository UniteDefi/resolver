import { SigningCosmWasmClient } from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import { readFileSync } from "fs";
import { join } from "path";

describe("Counter Contract", () => {
  const rpcEndpoint = process.env.RPC_ENDPOINT || "http://localhost:26657";
  const mnemonic = process.env.MNEMONIC || "satisfy adjust timber high purchase tuition stool faith fine install that you unaware feed domain license impose boss human eager hat rent enjoy dawn";
  const prefix = "osmo";
  
  let client: SigningCosmWasmClient;
  let wallet: DirectSecp256k1HdWallet;
  let walletAddress: string;
  let contractAddress: string;

  beforeAll(async () => {
    wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
      prefix,
    });
    
    const [account] = await wallet.getAccounts();
    walletAddress = account.address;
    
    client = await SigningCosmWasmClient.connectWithSigner(
      rpcEndpoint,
      wallet,
      {
        gasPrice: GasPrice.fromString("0.025uosmo"),
      }
    );
  });

  describe("Deployment", () => {
    it("should upload and instantiate the contract", async () => {
      const wasmPath = join(__dirname, "../contracts/counter/target/wasm32-unknown-unknown/release/counter.wasm");
      const wasm = readFileSync(wasmPath);
      
      console.log("[Counter/Deploy] Uploading contract...");
      const uploadResult = await client.upload(
        walletAddress,
        wasm,
        "auto"
      );
      
      expect(uploadResult.codeId).toBeGreaterThan(0);
      console.log("[Counter/Deploy] Code ID:", uploadResult.codeId);
      
      const instantiateMsg = {
        count: "100",
      };
      
      console.log("[Counter/Deploy] Instantiating contract...");
      const instantiateResult = await client.instantiate(
        walletAddress,
        uploadResult.codeId,
        instantiateMsg,
        "Counter Contract",
        "auto",
        {
          admin: walletAddress,
        }
      );
      
      contractAddress = instantiateResult.contractAddress;
      expect(contractAddress).toBeTruthy();
      console.log("[Counter/Deploy] Contract address:", contractAddress);
    });
  });

  describe("Query", () => {
    it("should query the initial count", async () => {
      const query = { get_count: {} };
      const result = await client.queryContractSmart(contractAddress, query);
      
      expect(result).toEqual({ count: "100" });
      console.log("[Counter/Query] Initial count:", result.count);
    });
  });

  describe("Execute", () => {
    it("should increment the counter", async () => {
      const msg = { increment: {} };
      
      console.log("[Counter/Execute] Incrementing...");
      const result = await client.execute(
        walletAddress,
        contractAddress,
        msg,
        "auto"
      );
      
      expect(result.transactionHash).toBeTruthy();
      
      const query = { get_count: {} };
      const countResult = await client.queryContractSmart(contractAddress, query);
      expect(countResult).toEqual({ count: "101" });
      console.log("[Counter/Execute] New count after increment:", countResult.count);
    });

    it("should decrement the counter", async () => {
      const msg = { decrement: {} };
      
      console.log("[Counter/Execute] Decrementing...");
      const result = await client.execute(
        walletAddress,
        contractAddress,
        msg,
        "auto"
      );
      
      expect(result.transactionHash).toBeTruthy();
      
      const query = { get_count: {} };
      const countResult = await client.queryContractSmart(contractAddress, query);
      expect(countResult).toEqual({ count: "100" });
      console.log("[Counter/Execute] New count after decrement:", countResult.count);
    });

    it("should handle multiple operations", async () => {
      console.log("[Counter/Execute] Running multiple operations...");
      
      for (let i = 0; i < 3; i++) {
        await client.execute(
          walletAddress,
          contractAddress,
          { increment: {} },
          "auto"
        );
      }
      
      const query = { get_count: {} };
      let countResult = await client.queryContractSmart(contractAddress, query);
      expect(countResult).toEqual({ count: "103" });
      console.log("[Counter/Execute] Count after 3 increments:", countResult.count);
      
      await client.execute(
        walletAddress,
        contractAddress,
        { decrement: {} },
        "auto"
      );
      
      countResult = await client.queryContractSmart(contractAddress, query);
      expect(countResult).toEqual({ count: "102" });
      console.log("[Counter/Execute] Final count:", countResult.count);
    });
  });
});