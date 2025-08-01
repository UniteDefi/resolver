import { RpcProvider } from "starknet";

async function verifyAddress() {
  const address = "0x0422bec5e5fbe0464b5b8889d874737c4cf72fe4f57bb6fb95b5ee688d96555b";
  
  const provider = new RpcProvider({ 
    nodeUrl: "https://starknet-sepolia.public.blastapi.io/rpc/v0_7"
  });
  
  console.log(`[Verify] Checking address: ${address}`);
  console.log(`[Verify] Network: StarkNet Sepolia`);
  
  try {
    // Try to get the contract at this address
    const classHash = await provider.getClassHashAt(address);
    console.log(`[Verify] Account contract exists with class hash: ${classHash}`);
    
    // Try to get nonce using the RPC call
    const nonceResult = await provider.call({
      contractAddress: address,
      entrypoint: "get_nonce",
      calldata: []
    });
    console.log(`[Verify] Account nonce: ${nonceResult}`);
    
    console.log(`[Verify] ✅ This is a deployed account!`);
    return true;
    
  } catch (error: any) {
    if (error.message.includes("Contract not found")) {
      console.log(`[Verify] ⚠️  Account contract not deployed yet`);
      console.log(`[Verify] This means either:`);
      console.log(`[Verify] 1. The address hasn't been funded yet`);
      console.log(`[Verify] 2. The funding transaction is still pending`);
      console.log(`[Verify] 3. This is not the correct address`);
    } else {
      console.log(`[Verify] Error: ${error.message}`);
    }
    return false;
  }
}

verifyAddress().catch(console.error);