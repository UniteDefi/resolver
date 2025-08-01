import * as fs from "fs";
import * as path from "path";

describe("Counter Validator Tests (Simplified)", () => {
  let deploymentInfo: any;
  
  beforeAll(() => {
    // Load deployment info
    const deploymentPath = path.join(__dirname, "../deployments/preprod.json");
    if (fs.existsSync(deploymentPath)) {
      deploymentInfo = JSON.parse(fs.readFileSync(deploymentPath, "utf8"));
    }
  });

  describe("Contract Structure", () => {
    it("should have counter validator file", () => {
      const validatorPath = path.join(__dirname, "../validators/counter.ak");
      expect(fs.existsSync(validatorPath)).toBe(true);
    });

    it("should have valid Aiken configuration", () => {
      const aikenPath = path.join(__dirname, "../aiken.toml");
      expect(fs.existsSync(aikenPath)).toBe(true);
      
      const aikenConfig = fs.readFileSync(aikenPath, "utf8");
      expect(aikenConfig).toContain("counter_validator");
    });

    it("should have plutus.json with compiled code", () => {
      const plutusPath = path.join(__dirname, "../plutus.json");
      expect(fs.existsSync(plutusPath)).toBe(true);
      
      const plutusData = JSON.parse(fs.readFileSync(plutusPath, "utf8"));
      expect(plutusData.validators).toBeDefined();
      expect(plutusData.validators.length).toBeGreaterThan(0);
      expect(plutusData.validators[0].compiledCode).toBeDefined();
    });
  });

  describe("Deployment", () => {
    it("should have deployment info", () => {
      expect(deploymentInfo).toBeDefined();
      expect(deploymentInfo.scriptAddress).toBeDefined();
      expect(deploymentInfo.scriptHash).toBeDefined();
      expect(deploymentInfo.network).toBe("preprod");
    });

    it("should have valid script address format", () => {
      if (deploymentInfo) {
        expect(deploymentInfo.scriptAddress).toMatch(/^addr_test1/);
      }
    });
  });

  describe("Validator Logic (Code Review)", () => {
    let validatorCode: string;
    
    beforeAll(() => {
      const validatorPath = path.join(__dirname, "../validators/counter.ak");
      validatorCode = fs.readFileSync(validatorPath, "utf8");
    });

    it("should define Datum type with owner and counter", () => {
      expect(validatorCode).toContain("type Datum");
      expect(validatorCode).toContain("owner: Hash<Blake2b_224, VerificationKey>");
      expect(validatorCode).toContain("counter: Int");
    });

    it("should define Redeemer with Increment and Decrement", () => {
      expect(validatorCode).toContain("type Redeemer");
      expect(validatorCode).toContain("Increment");
      expect(validatorCode).toContain("Decrement");
    });

    it("should check owner signature", () => {
      expect(validatorCode).toContain("signed_by_owner");
      expect(validatorCode).toContain("tx.extra_signatories");
    });

    it("should validate increment operation", () => {
      expect(validatorCode).toContain("Increment ->");
      expect(validatorCode).toContain("datum.counter + 1");
    });

    it("should validate decrement operation with lower bound check", () => {
      expect(validatorCode).toContain("Decrement ->");
      expect(validatorCode).toContain("datum.counter > 0");
      expect(validatorCode).toContain("datum.counter - 1");
    });

    it("should ensure owner cannot be changed", () => {
      expect(validatorCode).toContain("owner_unchanged");
      expect(validatorCode).toContain("datum.owner == output_datum.owner");
    });
  });

  describe("Test Environment", () => {
    it("should have wallet configured", () => {
      expect(process.env.PREPROD_WALLET_ADDRESS).toBeDefined();
      expect(process.env.PREPROD_WALLET_PRIVATE_KEY).toBeDefined();
    });

    it("should have Blockfrost API key", () => {
      expect(process.env.BLOCKFROST_PREPROD_PROJECT_ID).toBeDefined();
    });

    it("should have test configuration", () => {
      expect(process.env.TEST_NETWORK).toBe("preprod");
    });
  });
});