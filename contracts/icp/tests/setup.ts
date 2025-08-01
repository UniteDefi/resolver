import { config } from "dotenv";

// Load environment variables
config();

// Set test timeout to 30 seconds for canister operations
jest.setTimeout(30000);