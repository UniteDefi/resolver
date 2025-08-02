// Simple test validator to verify build works

validator simple_test {
  fn spend(_datum: Data, _redeemer: Data, _context: ScriptContext) -> Bool {
    True
  }
}

use aiken/transaction.{ScriptContext}