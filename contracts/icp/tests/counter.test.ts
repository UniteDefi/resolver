import { Actor, HttpAgent } from "@dfinity/agent";
import { Principal } from "@dfinity/principal";
import { idlFactory } from "../.dfx/local/canisters/counter/counter.did.js";
import type { _SERVICE } from "../.dfx/local/canisters/counter/counter.did";

describe("Counter Canister", () => {
  let actor: _SERVICE;
  let agent: HttpAgent;

  beforeAll(async () => {
    // Create agent
    const host = process.env.DFX_NETWORK === "ic" ? "https://ic0.app" : "http://localhost:8000";
    agent = new HttpAgent({ host });
    
    // Fetch root key for local development
    if (process.env.DFX_NETWORK !== "ic") {
      await agent.fetchRootKey();
    }

    // Get canister ID from environment or use default local canister ID
    const canisterId = process.env.COUNTER_CANISTER_ID || "rrkah-fqaaa-aaaaa-aaaaq-cai";
    
    // Create actor
    actor = Actor.createActor<_SERVICE>(idlFactory, {
      agent,
      canisterId: Principal.fromText(canisterId),
    });
  });

  describe("getValue", () => {
    it("should return initial value of 0", async () => {
      const value = await actor.getValue();
      expect(Number(value)).toBe(0);
    });
  });

  describe("increment", () => {
    it("should increment the counter by 1", async () => {
      const initialValue = await actor.getValue();
      const newValue = await actor.increment();
      expect(Number(newValue)).toBe(Number(initialValue) + 1);
    });

    it("should handle multiple increments", async () => {
      const initialValue = await actor.getValue();
      await actor.increment();
      await actor.increment();
      const finalValue = await actor.getValue();
      expect(Number(finalValue)).toBe(Number(initialValue) + 2);
    });
  });

  describe("decrement", () => {
    it("should decrement the counter by 1", async () => {
      // First increment to ensure we have a value > 0
      await actor.increment();
      const initialValue = await actor.getValue();
      const newValue = await actor.decrement();
      expect(Number(newValue)).toBe(Number(initialValue) - 1);
    });

    it("should not go below 0", async () => {
      // Reset to 0
      await actor.reset();
      const value = await actor.decrement();
      expect(Number(value)).toBe(0);
    });
  });

  describe("reset", () => {
    it("should reset counter to 0", async () => {
      // Increment a few times
      await actor.increment();
      await actor.increment();
      await actor.increment();
      
      // Reset
      await actor.reset();
      
      // Check value
      const value = await actor.getValue();
      expect(Number(value)).toBe(0);
    });
  });
});