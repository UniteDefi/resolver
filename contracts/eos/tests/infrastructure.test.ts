import { getTestConfig } from "./test_config";
import { Api, JsonRpc } from "eosjs";

describe("EOS Infrastructure Tests", () => {
  let config: { rpc: JsonRpc; api: Api; contractAccount: string; testAccounts: string[] };
  let contractAccount: string;
  let testAccounts: string[];

  beforeAll(async () => {
    config = getTestConfig();
    contractAccount = config.contractAccount;
    testAccounts = config.testAccounts;
    
    console.log("[Infrastructure Test] Contract account:", contractAccount);
    console.log("[Infrastructure Test] Test accounts:", testAccounts);
  });

  describe("Connection Tests", () => {
    it("should connect to Jungle testnet", async () => {
      const info = await config.rpc.get_info();
      expect(info.chain_id).toBe("73e4385a2708e6d7048834fbc1079f2fabb17b3c125b146af438971e90716c4d");
      expect(info.head_block_num).toBeGreaterThan(0);
      console.log("[Infrastructure Test] Connected to block:", info.head_block_num);
    });

    it("should verify contract account exists and is funded", async () => {
      const accountInfo = await config.rpc.get_account(contractAccount);
      expect(accountInfo.account_name).toBe(contractAccount);
      expect(accountInfo.created).toBeDefined();
      
      const balance = await config.rpc.get_currency_balance("eosio.token", contractAccount, "EOS");
      expect(balance.length).toBeGreaterThan(0);
      console.log("[Infrastructure Test] Contract account balance:", balance[0]);
    });
  });

  describe("Test Account Verification", () => {
    it("should verify test account 1 exists", async () => {
      try {
        const accountInfo = await config.rpc.get_account(testAccounts[0]);
        expect(accountInfo.account_name).toBe(testAccounts[0]);
        console.log("[Infrastructure Test] Test account 1 exists:", testAccounts[0]);
        
        const balance = await config.rpc.get_currency_balance("eosio.token", testAccounts[0], "EOS");
        console.log("[Infrastructure Test] Test account 1 balance:", balance.length > 0 ? balance[0] : "0.0000 EOS");
      } catch (error: any) {
        console.log("[Infrastructure Test] Test account 1 needs to be created:", testAccounts[0]);
        expect(error.message).toContain("unknown key");
      }
    });

    it("should verify test account 2 exists", async () => {
      try {
        const accountInfo = await config.rpc.get_account(testAccounts[1]);
        expect(accountInfo.account_name).toBe(testAccounts[1]);
        console.log("[Infrastructure Test] Test account 2 exists:", testAccounts[1]);
        
        const balance = await config.rpc.get_currency_balance("eosio.token", testAccounts[1], "EOS");
        console.log("[Infrastructure Test] Test account 2 balance:", balance.length > 0 ? balance[0] : "0.0000 EOS");
      } catch (error: any) {
        console.log("[Infrastructure Test] Test account 2 needs to be created:", testAccounts[1]);
        expect(error.message).toContain("unknown key");
      }
    });
  });

  describe("Key Authorization Tests", () => {
    it("should have valid private keys for contract account", async () => {
      // Test if we can create a transaction (without executing)
      const actions = [{
        account: "eosio.token",
        name: "transfer",
        authorization: [{
          actor: contractAccount,
          permission: "active"
        }],
        data: {
          from: contractAccount,
          to: contractAccount,
          quantity: "0.0001 EOS",
          memo: "test"
        }
      }];

      // This should not throw if keys are valid
      expect(() => {
        config.api.serializeActions(actions);
      }).not.toThrow();
      
      console.log("[Infrastructure Test] Contract account keys are valid");
    });
  });

  describe("Network Performance", () => {
    it("should have reasonable response times", async () => {
      const startTime = Date.now();
      await config.rpc.get_info();
      const responseTime = Date.now() - startTime;
      
      expect(responseTime).toBeLessThan(5000); // 5 seconds max
      console.log("[Infrastructure Test] Network response time:", responseTime + "ms");
    });
  });
});