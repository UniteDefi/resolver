import { execSync } from "child_process";
import { readFileSync } from "fs";
import { join } from "path";

describe("Counter Contract - Integration Tests", () => {
  const contractId = "CABNSB7GMZM5BC6IM62E5JNUBHNSUIJQUFQRNPLYMKTKD466RSVS2XIQ";
  const secretKey = process.env.STELLAR_SECRET_KEY || "SAKGIZT7OSGTRGS55ZSZPWLISCTXQPGH6VT7LOWYPANBNXEF6HIC3WJO";
  const rpcUrl = "https://soroban-testnet.stellar.org";
  const networkPassphrase = "Test SDF Network ; September 2015";

  function invokeContract(method: string, expectWrite = false): string {
    const cmd = `stellar contract invoke \
      --id ${contractId} \
      --source ${secretKey} \
      --rpc-url ${rpcUrl} \
      --network-passphrase "${networkPassphrase}" \
      -- \
      ${method}`;
    
    try {
      const output = execSync(cmd, { encoding: "utf-8" });
      // Extract the actual result (first line)
      return output.split("\n")[0].trim();
    } catch (error: any) {
      console.error(`[Test] Failed to invoke ${method}:`, error.message);
      throw error;
    }
  }

  describe("Contract Operations", () => {
    it("should get count", () => {
      console.log("[Integration Test] Getting count...");
      const count = invokeContract("get_count");
      console.log("[Integration Test] Current count:", count);
      expect(parseInt(count)).toBeGreaterThanOrEqual(0);
    });

    it("should increment counter", () => {
      console.log("[Integration Test] Getting initial count...");
      const initialCount = parseInt(invokeContract("get_count"));
      
      console.log("[Integration Test] Incrementing counter...");
      const newCount = parseInt(invokeContract("increment", true));
      
      console.log(`[Integration Test] Count changed from ${initialCount} to ${newCount}`);
      expect(newCount).toBe(initialCount + 1);
    });

    it("should decrement counter", () => {
      console.log("[Integration Test] Getting initial count...");
      const initialCount = parseInt(invokeContract("get_count"));
      
      if (initialCount > 0) {
        console.log("[Integration Test] Decrementing counter...");
        const newCount = parseInt(invokeContract("decrement", true));
        
        console.log(`[Integration Test] Count changed from ${initialCount} to ${newCount}`);
        expect(newCount).toBe(initialCount - 1);
      } else {
        console.log("[Integration Test] Count is 0, testing decrement at minimum...");
        const newCount = parseInt(invokeContract("decrement", true));
        expect(newCount).toBe(0);
      }
    });

    it("should not go below zero", () => {
      console.log("[Integration Test] Testing minimum value constraint...");
      
      // First, decrement to 0
      let currentCount = parseInt(invokeContract("get_count"));
      while (currentCount > 0) {
        console.log(`[Integration Test] Decrementing from ${currentCount}...`);
        currentCount = parseInt(invokeContract("decrement", true));
      }
      
      // Now try to go below 0
      console.log("[Integration Test] Attempting to decrement below 0...");
      const finalCount = parseInt(invokeContract("decrement", true));
      expect(finalCount).toBe(0);
    });
  });

  describe("Contract Details", () => {
    it("should verify deployment info", () => {
      const deploymentPath = join(__dirname, "..", "deployment-testnet.json");
      const deployment = JSON.parse(readFileSync(deploymentPath, "utf-8"));
      
      expect(deployment.contractId).toBe(contractId);
      expect(deployment.network).toBe("testnet");
      console.log("[Integration Test] Contract explorer URL:", deployment.explorerUrl);
    });
  });
});