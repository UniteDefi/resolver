import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import { BASE_CONFIG } from "../config";

export class BaseHelper {
  private provider: ethers.JsonRpcProvider;
  private wallet: ethers.Wallet;
  private htlcContract: ethers.Contract;
  private tokenContract: ethers.Contract;
  
  constructor(privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(BASE_CONFIG.rpcUrl);
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }
  
  async init() {
    console.log("[BaseHelper] Initializing Base connection...");
    
    // Load deployed addresses
    const addressesPath = path.join(__dirname, "../.deployed-addresses.json");
    if (!fs.existsSync(addressesPath)) {
      throw new Error("Deployed addresses not found. Run deploy-base.ts first.");
    }
    
    const addresses = JSON.parse(fs.readFileSync(addressesPath, "utf8"));
    
    // Load contract ABIs
    const htlcArtifact = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../contracts/HTLCEscrow.json"),
        "utf8"
      )
    );
    
    const tokenArtifact = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "../contracts/MockERC20.json"),
        "utf8"
      )
    );
    
    // Initialize contracts
    this.htlcContract = new ethers.Contract(
      addresses.htlcAddress,
      htlcArtifact.abi,
      this.wallet
    );
    
    this.tokenContract = new ethers.Contract(
      addresses.tokenAddress,
      tokenArtifact.abi,
      this.wallet
    );
    
    console.log("[BaseHelper] Connected to wallet:", this.wallet.address);
    console.log("[BaseHelper] HTLC contract:", addresses.htlcAddress);
    console.log("[BaseHelper] Token contract:", addresses.tokenAddress);
  }
  
  async createHTLC(
    recipient: string,
    token: string | null,
    amount: bigint,
    hashlock: string,
    timelock: number
  ): Promise<string> {
    console.log("[BaseHelper] Creating HTLC...");
    
    let tx;
    if (token === null) {
      // ETH transfer
      tx = await this.htlcContract.createHTLC(
        recipient,
        ethers.ZeroAddress,
        amount,
        hashlock,
        timelock,
        { value: amount }
      );
    } else {
      // Token transfer - approve first
      console.log("[BaseHelper] Approving token transfer...");
      const approveTx = await this.tokenContract.approve(
        await this.htlcContract.getAddress(),
        amount
      );
      await approveTx.wait();
      
      tx = await this.htlcContract.createHTLC(
        recipient,
        token,
        amount,
        hashlock,
        timelock
      );
    }
    
    const receipt = await tx.wait();
    console.log("[BaseHelper] HTLC created, tx hash:", receipt.hash);
    
    // Extract HTLC ID from events
    const htlcId = this.extractHTLCIdFromReceipt(receipt);
    return htlcId;
  }
  
  async withdrawHTLC(htlcId: string, preimage: string): Promise<void> {
    console.log("[BaseHelper] Withdrawing HTLC...");
    
    const tx = await this.htlcContract.withdraw(htlcId, preimage);
    const receipt = await tx.wait();
    
    console.log("[BaseHelper] HTLC withdrawn, tx hash:", receipt.hash);
  }
  
  async refundHTLC(htlcId: string): Promise<void> {
    console.log("[BaseHelper] Refunding HTLC...");
    
    const tx = await this.htlcContract.refund(htlcId);
    const receipt = await tx.wait();
    
    console.log("[BaseHelper] HTLC refunded, tx hash:", receipt.hash);
  }
  
  async getHTLC(htlcId: string): Promise<any> {
    const htlc = await this.htlcContract.getHTLC(htlcId);
    return {
      sender: htlc[0],
      recipient: htlc[1],
      token: htlc[2],
      amount: htlc[3],
      hashlock: htlc[4],
      timelock: htlc[5],
      withdrawn: htlc[6],
      refunded: htlc[7],
      preimage: htlc[8],
    };
  }
  
  async mintTokens(to: string, amount: bigint): Promise<void> {
    console.log("[BaseHelper] Minting tokens...");
    
    const tx = await this.tokenContract.mint(to, amount);
    await tx.wait();
    
    console.log("[BaseHelper] Tokens minted:", amount.toString());
  }
  
  async getTokenBalance(address: string): Promise<bigint> {
    return await this.tokenContract.balanceOf(address);
  }
  
  async getETHBalance(address: string): Promise<bigint> {
    return await this.provider.getBalance(address);
  }
  
  private extractHTLCIdFromReceipt(receipt: any): string {
    // Find HTLCCreated event
    for (const log of receipt.logs) {
      try {
        const parsed = this.htlcContract.interface.parseLog(log);
        if (parsed && parsed.name === "HTLCCreated") {
          return parsed.args.htlcId;
        }
      } catch (e) {
        // Not this event
      }
    }
    throw new Error("HTLCCreated event not found");
  }
  
  generateHashlock(preimage: string): string {
    return ethers.sha256(ethers.toUtf8Bytes(preimage));
  }
  
  async waitForBlock(blocks: number): Promise<void> {
    console.log(`[BaseHelper] Waiting for ${blocks} blocks...`);
    const startBlock = await this.provider.getBlockNumber();
    
    while (await this.provider.getBlockNumber() < startBlock + blocks) {
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}