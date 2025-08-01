use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext, Spend}
use aiken/transaction/credential.{VerificationKey}

type Datum {
  owner: Hash<Blake2b_224, VerificationKey>,
  counter: Int,
}

type Redeemer {
  Increment
  Decrement
}

validator counter {
  fn spend(datum: Datum, redeemer: Redeemer, context: ScriptContext) -> Bool {
    when context.purpose is {
      Spend(_) -> {
        let tx = context.transaction
        
        // Simplified validation for testing
        when redeemer is {
          Increment -> True
          Decrement -> datum.counter > 0
        }
      }
      _ -> False
    }
  }
}