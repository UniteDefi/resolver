import { hash, CallData } from "starknet";

function calculateAddress() {
  const publicKey = "0x7a10407145d05487a7a32de2ed267827c79b2cf88509f040ae7f2099ef81392";
  const classHash = "0x04c6d6cf894f8bc96bb9c525e6853e5483177841f7388f74a46cfda6f028c755";
  
  // Calculate account address
  const accountConstructorCallData = CallData.compile({ publicKey: publicKey });
  const accountAddress = hash.calculateContractAddressFromHash(
    publicKey,
    classHash,
    accountConstructorCallData,
    0
  );
  
  console.log("Public Key:", publicKey);
  console.log("Class Hash:", classHash);
  console.log("Account Address:", accountAddress);
  
  return accountAddress;
}

calculateAddress();