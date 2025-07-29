import { Database } from "better-sqlite3";
import * as path from "path";
import * as fs from "fs";

interface TestDatabase {
  db: Database;
  path: string;
}

export class DatabaseTestHelper {
  private testDatabases: Map<string, TestDatabase> = new Map();

  /**
   * Create a test database with a unique name
   */
  createTestDatabase(name: string): Database {
    const testDbPath = path.join(__dirname, "..", "test-dbs", `${name}-${Date.now()}.db`);
    
    // Ensure directory exists
    const dbDir = path.dirname(testDbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    const Database = require("better-sqlite3");
    const db = new Database(testDbPath);
    
    this.testDatabases.set(name, { db, path: testDbPath });
    console.log(`[DatabaseTestHelper] Created test database: ${testDbPath}`);
    
    return db;
  }

  /**
   * Initialize relayer database schema
   */
  initializeRelayerSchema(db: Database): void {
    db.exec(`
      -- Orders table
      CREATE TABLE IF NOT EXISTS orders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT UNIQUE NOT NULL,
        signature TEXT NOT NULL,
        chain_id INTEGER NOT NULL,
        requester TEXT NOT NULL,
        input_asset TEXT NOT NULL,
        output_asset TEXT NOT NULL,
        input_amount TEXT NOT NULL,
        output_amount TEXT NOT NULL,
        recipient TEXT NOT NULL,
        creation_timestamp INTEGER NOT NULL,
        fill_deadline INTEGER NOT NULL,
        is_exact_input BOOLEAN NOT NULL,
        initial_price REAL NOT NULL,
        final_price REAL NOT NULL,
        safety_factor REAL NOT NULL,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      -- Order commitments table
      CREATE TABLE IF NOT EXISTS order_commitments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        order_id TEXT NOT NULL,
        resolver TEXT NOT NULL,
        committed_price TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        status TEXT DEFAULT 'pending',
        secret_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (order_id) REFERENCES orders (order_id)
      );

      -- Create indexes
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders (status);
      CREATE INDEX IF NOT EXISTS idx_orders_chain_id ON orders (chain_id);
      CREATE INDEX IF NOT EXISTS idx_commitments_order_id ON order_commitments (order_id);
      CREATE INDEX IF NOT EXISTS idx_commitments_resolver ON order_commitments (resolver);
    `);

    console.log("[DatabaseTestHelper] Initialized relayer database schema");
  }

  /**
   * Insert test order data
   */
  insertTestOrder(db: Database, orderData: any): void {
    const stmt = db.prepare(`
      INSERT INTO orders (
        order_id, signature, chain_id, requester, input_asset, 
        output_asset, input_amount, output_amount, recipient,
        creation_timestamp, fill_deadline, is_exact_input,
        initial_price, final_price, safety_factor, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      orderData.orderId || `0x${Date.now().toString(16)}`,
      orderData.signature || "0xmocksignature",
      orderData.chainId || 1,
      orderData.requester || "0x0000000000000000000000000000000000000001",
      orderData.inputAsset || "0x0000000000000000000000000000000000000002",
      orderData.outputAsset || "0x0000000000000000000000000000000000000003",
      orderData.inputAmount || "1000000000000000000",
      orderData.outputAmount || "2000000000000000000",
      orderData.recipient || orderData.requester || "0x0000000000000000000000000000000000000001",
      orderData.creationTimestamp || Math.floor(Date.now() / 1000),
      orderData.fillDeadline || Math.floor(Date.now() / 1000) + 300,
      orderData.isExactInput !== undefined ? orderData.isExactInput : true,
      orderData.initialPrice || 2.0,
      orderData.finalPrice || 1.9,
      orderData.safetyFactor || 0.95,
      orderData.status || "pending"
    );

    console.log(`[DatabaseTestHelper] Inserted test order: ${orderData.orderId}`);
  }

  /**
   * Clean up test databases
   */
  async cleanup(): Promise<void> {
    for (const [name, testDb] of this.testDatabases) {
      try {
        testDb.db.close();
        if (fs.existsSync(testDb.path)) {
          fs.unlinkSync(testDb.path);
        }
        console.log(`[DatabaseTestHelper] Cleaned up test database: ${name}`);
      } catch (error) {
        console.error(`[DatabaseTestHelper] Error cleaning up ${name}:`, error);
      }
    }
    this.testDatabases.clear();
  }

  /**
   * Get all orders from database
   */
  getAllOrders(db: Database): any[] {
    return db.prepare("SELECT * FROM orders").all();
  }

  /**
   * Get all commitments for an order
   */
  getOrderCommitments(db: Database, orderId: string): any[] {
    return db.prepare("SELECT * FROM order_commitments WHERE order_id = ?").all(orderId);
  }
}