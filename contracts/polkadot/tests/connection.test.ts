import { ApiPromise, WsProvider, Keyring } from "@polkadot/api";
import * as dotenv from "dotenv";

dotenv.config();

describe("Polkadot Connection Tests", () => {
  let api: ApiPromise;
  
  beforeAll(async () => {
    const wsProvider = new WsProvider(process.env.TESTNET_WS_URL || "wss://westend-rpc.polkadot.io");
    api = await ApiPromise.create({ provider: wsProvider });
  }, 30000);
  
  afterAll(async () => {
    await api.disconnect();
  });
  
  describe("Network Connection", () => {
    it("should connect to Westend testnet", async () => {
      const chain = await api.rpc.system.chain();
      expect(chain.toString()).toBe("Westend");
    });
    
    it("should get chain properties", async () => {
      const properties = await api.rpc.system.properties();
      const props = properties.toHuman() as any;
      
      expect(props.tokenSymbol).toEqual(["WND"]);
      expect(props.tokenDecimals).toEqual(["12"]);
      expect(props.ss58Format).toBe("42");
    });
    
    it("should get latest block", async () => {
      const header = await api.rpc.chain.getHeader();
      expect(header.number.toNumber()).toBeGreaterThan(0);
    });
  });
  
  describe("Account Tests", () => {
    it("should create account from mnemonic", () => {
      const keyring = new Keyring({ type: "sr25519" });
      const account = keyring.addFromUri(process.env.DEPLOYER_MNEMONIC || "");
      
      expect(account.address).toBe("5HKbbeoeQ9SmokJDmiTXQnBzfABVgNniRQkgN8TfASSdie6H");
    });
    
    it("should check account balance", async () => {
      const keyring = new Keyring({ type: "sr25519" });
      const account = keyring.addFromUri(process.env.DEPLOYER_MNEMONIC || "");
      
      const accountInfo = await api.query.system.account(account.address);
      const balance = accountInfo as any;
      
      console.log("[Test] Account balance:", balance.data.free.toHuman());
      
      expect(balance.data.free).toBeDefined();
      expect(balance.data.reserved).toBeDefined();
    });
  });
  
  describe("Runtime API Tests", () => {
    it("should have contracts pallet", async () => {
      const metadata = await api.rpc.state.getMetadata();
      const pallets = metadata.asLatest.pallets.map(p => p.name.toString());
      
      console.log("[Test] Available pallets:", pallets.filter(p => p.includes("Contract")));
      
      // Westend should have Contracts pallet
      expect(pallets).toContain("Contracts");
    });
    
    it("should get runtime version", async () => {
      const version = await api.rpc.state.getRuntimeVersion();
      
      console.log("[Test] Runtime version:", {
        specName: version.specName.toString(),
        specVersion: version.specVersion.toNumber(),
        implName: version.implName.toString(),
        implVersion: version.implVersion.toNumber()
      });
      
      expect(version.specName.toString()).toBe("westend");
      expect(version.specVersion.toNumber()).toBeGreaterThan(0);
    });
  });
});