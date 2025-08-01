import { getTestConfig, getTableRows, transact } from "./test_config";
import { Api, JsonRpc } from "eosjs";

describe("Counter Contract Tests", () => {
  let config: { rpc: JsonRpc; api: Api; contractAccount: string; testAccounts: string[] };
  let contractAccount: string;
  let testAccounts: string[];

  beforeAll(async () => {
    config = getTestConfig();
    contractAccount = config.contractAccount;
    testAccounts = config.testAccounts;
    
    console.log("[Test Setup] Contract account:", contractAccount);
    console.log("[Test Setup] Test accounts:", testAccounts);
  });

  describe("Increment Action", () => {
    it("should create a new counter when incrementing for the first time", async () => {
      const user = testAccounts[0];
      
      // Execute increment action
      const result = await transact(config.api, [{
        account: contractAccount,
        name: "increment",
        authorization: [{
          actor: user,
          permission: "active"
        }],
        data: { user }
      }]);

      console.log("[increment] Transaction ID:", result.transaction_id);

      // Check table data
      const rows = await getTableRows(config.rpc, contractAccount, contractAccount, "counters");
      const userRow = rows.find((row: any) => row.user === user);
      
      expect(userRow).toBeDefined();
      expect(userRow.value).toBe("1");
      expect(userRow.last_modified).toBeDefined();
    });

    it("should increment existing counter", async () => {
      const user = testAccounts[0];
      
      // Get initial value
      const initialRows = await getTableRows(config.rpc, contractAccount, contractAccount, "counters");
      const initialRow = initialRows.find((row: any) => row.user === user);
      const initialValue = initialRow ? parseInt(initialRow.value) : 0;
      
      // Execute increment action
      await transact(config.api, [{
        account: contractAccount,
        name: "increment",
        authorization: [{
          actor: user,
          permission: "active"
        }],
        data: { user }
      }]);

      // Check updated value
      const rows = await getTableRows(config.rpc, contractAccount, contractAccount, "counters");
      const userRow = rows.find((row: any) => row.user === user);
      
      expect(userRow).toBeDefined();
      expect(parseInt(userRow.value)).toBe(initialValue + 1);
    });
  });

  describe("Decrement Action", () => {
    it("should decrement existing counter", async () => {
      const user = testAccounts[0];
      
      // Ensure counter exists and has value > 0
      await transact(config.api, [{
        account: contractAccount,
        name: "increment",
        authorization: [{
          actor: user,
          permission: "active"
        }],
        data: { user }
      }]);
      
      // Get current value
      const initialRows = await getTableRows(config.rpc, contractAccount, contractAccount, "counters");
      const initialRow = initialRows.find((row: any) => row.user === user);
      const initialValue = parseInt(initialRow.value);
      
      // Execute decrement action
      await transact(config.api, [{
        account: contractAccount,
        name: "decrement",
        authorization: [{
          actor: user,
          permission: "active"
        }],
        data: { user }
      }]);

      // Check updated value
      const rows = await getTableRows(config.rpc, contractAccount, contractAccount, "counters");
      const userRow = rows.find((row: any) => row.user === user);
      
      expect(userRow).toBeDefined();
      expect(parseInt(userRow.value)).toBe(initialValue - 1);
    });

    it("should fail when counter does not exist", async () => {
      const user = testAccounts[1]; // Use different account
      
      await expect(
        transact(config.api, [{
          account: contractAccount,
          name: "decrement",
          authorization: [{
            actor: user,
            permission: "active"
          }],
          data: { user }
        }])
      ).rejects.toThrow();
    });

    it("should fail when trying to decrement below zero", async () => {
      const user = testAccounts[0];
      
      // Reset counter to 0
      await transact(config.api, [{
        account: contractAccount,
        name: "reset",
        authorization: [{
          actor: user,
          permission: "active"
        }],
        data: { user }
      }]);
      
      // Try to decrement below 0
      await expect(
        transact(config.api, [{
          account: contractAccount,
          name: "decrement",
          authorization: [{
            actor: user,
            permission: "active"
          }],
          data: { user }
        }])
      ).rejects.toThrow();
    });
  });

  describe("Reset Action", () => {
    it("should reset counter to zero", async () => {
      const user = testAccounts[0];
      
      // Increment counter a few times
      for (let i = 0; i < 3; i++) {
        await transact(config.api, [{
          account: contractAccount,
          name: "increment",
          authorization: [{
            actor: user,
            permission: "active"
          }],
          data: { user }
        }]);
      }
      
      // Execute reset action
      await transact(config.api, [{
        account: contractAccount,
        name: "reset",
        authorization: [{
          actor: user,
          permission: "active"
        }],
        data: { user }
      }]);

      // Check value is 0
      const rows = await getTableRows(config.rpc, contractAccount, contractAccount, "counters");
      const userRow = rows.find((row: any) => row.user === user);
      
      expect(userRow).toBeDefined();
      expect(userRow.value).toBe("0");
    });

    it("should fail when counter does not exist", async () => {
      const user = "newuser"; // Non-existent user
      
      await expect(
        transact(config.api, [{
          account: contractAccount,
          name: "reset",
          authorization: [{
            actor: user,
            permission: "active"
          }],
          data: { user }
        }])
      ).rejects.toThrow();
    });
  });

  describe("GetValue Action", () => {
    it("should retrieve counter value", async () => {
      const user = testAccounts[0];
      
      // This action prints the value, so we just check it doesn't throw
      await expect(
        transact(config.api, [{
          account: contractAccount,
          name: "getvalue",
          authorization: [{
            actor: user,
            permission: "active"
          }],
          data: { user }
        }])
      ).resolves.toBeDefined();
    });
  });

  describe("Authorization Tests", () => {
    it("should require user authorization for increment", async () => {
      const user = testAccounts[0];
      const otherUser = testAccounts[1];
      
      // Try to increment with wrong authorization
      await expect(
        transact(config.api, [{
          account: contractAccount,
          name: "increment",
          authorization: [{
            actor: otherUser,
            permission: "active"
          }],
          data: { user }
        }])
      ).rejects.toThrow();
    });
  });
});