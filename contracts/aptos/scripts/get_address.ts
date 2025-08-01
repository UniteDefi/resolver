import { Account, Ed25519PrivateKey } from "@aptos-labs/ts-sdk";
import dotenv from "dotenv";

dotenv.config();

const privateKey = process.env.APTOS_PRIVATE_KEY;
if (!privateKey) {
  console.error("APTOS_PRIVATE_KEY not found");
  process.exit(1);
}

const account = Account.fromPrivateKey({
  privateKey: new Ed25519PrivateKey(privateKey),
});

console.log(account.accountAddress.toString());