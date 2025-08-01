import { Ed25519Keypair } from "@mysten/sui.js/keypairs/ed25519";
import { toB64 } from "@mysten/sui.js/utils";
import * as dotenv from "dotenv";
import * as path from "path";

dotenv.config({ path: path.join(__dirname, "../.env") });

const privateKey = process.env.SUI_PRIVATE_KEY;
if (!privateKey) {
  throw new Error("SUI_PRIVATE_KEY not set in environment");
}

const keypair = Ed25519Keypair.fromSecretKey(Buffer.from(privateKey, "hex"));
const address = keypair.toSuiAddress();

// Export in the format expected by sui keytool
const exportedKey = keypair.export();
console.log("[Import] Address:", address);
console.log("[Import] Private key in sui format:", exportedKey.privateKey);

// Create the suiprivkey format
const keyBytes = Buffer.from(privateKey, "hex");
const suiPrivateKey = `suiprivkey1${toB64(Buffer.concat([Buffer.from([0]), keyBytes]))}`;
console.log("\n[Import] Import this key using:");
console.log(`echo "${suiPrivateKey}" | sui keytool import --scheme ed25519`);