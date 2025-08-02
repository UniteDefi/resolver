use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext, Spend, InlineDatum}
use aiken/transaction/credential.{VerificationKey}
use unite_types.{FactoryDatum, FactoryRedeemer, EscrowDatum, Active}

validator unite_factory {
  fn spend(
    datum: FactoryDatum,
    redeemer: FactoryRedeemer,
    context: ScriptContext,
  ) -> Bool {
    when context.purpose is {
      Spend(_) -> {
        let tx = context.transaction
        let signatories = tx.extra_signatories
        
        when redeemer is {
          CreateEscrow { order_hash, is_source, initial_resolver, partial_amount } -> {
            // Verify resolver signed
            expect list.has(signatories, initial_resolver)
            
            // Verify escrow output is created with correct datum
            verify_escrow_created(
              order_hash, 
              is_source, 
              initial_resolver, 
              partial_amount, 
              tx.outputs
            ) &&
            // Update factory state
            verify_factory_updated(datum, tx.outputs)
          }
          
          UpdateAdmin { new_admin } -> {
            // Only current admin can update
            expect list.has(signatories, datum.admin)
            
            // Verify factory output has new admin
            verify_admin_updated(datum, new_admin, tx.outputs)
          }
        }
      }
      _ -> False
    }
  }
}

fn verify_escrow_created(
  order_hash: ByteArray,
  is_source: Bool,
  initial_resolver: Hash<Blake2b_224, VerificationKey>,
  partial_amount: Int,
  outputs: List<Output>,
) -> Bool {
  // Verify escrow output exists with correct initial state
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          EscrowDatum(escrow_data) -> 
            escrow_data.order_hash == order_hash &&
            escrow_data.is_source == is_source &&
            escrow_data.resolver == initial_resolver &&
            escrow_data.partial_amount == partial_amount &&
            escrow_data.state == Active
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_factory_updated(
  datum: FactoryDatum,
  outputs: List<Output>,
) -> Bool {
  // Verify factory output has incremented escrow count
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          FactoryDatum(factory_data) -> 
            factory_data.escrow_count == datum.escrow_count + 1 &&
            factory_data.admin == datum.admin
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_admin_updated(
  datum: FactoryDatum,
  new_admin: Hash<Blake2b_224, VerificationKey>,
  outputs: List<Output>,
) -> Bool {
  // Verify factory output has new admin
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          FactoryDatum(factory_data) -> 
            factory_data.admin == new_admin &&
            factory_data.escrow_count == datum.escrow_count
          _ -> False
        }
      }
      _ -> False
    }
  })
}

use aiken/transaction.{Output}
