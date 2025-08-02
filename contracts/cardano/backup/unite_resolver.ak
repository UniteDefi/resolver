use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext, Spend, InlineDatum}
use aiken/transaction/credential.{VerificationKey}
use unite_types.{ResolverDatum, ResolverRedeemer}
use unite_utils.{calculate_safety_deposit}

validator unite_resolver {
  fn spend(
    datum: ResolverDatum,
    redeemer: ResolverRedeemer,
    context: ScriptContext,
  ) -> Bool {
    when context.purpose is {
      Spend(_) -> {
        let tx = context.transaction
        let signatories = tx.extra_signatories
        
        // Only the resolver can operate their own contract
        expect list.has(signatories, datum.resolver)
        
        when redeemer is {
          CommitToOrder { order_hash, partial_amount, safety_deposit } -> {
            // Verify commitment amounts are correct
            let required_safety_deposit = calculate_safety_deposit(partial_amount)
            expect safety_deposit >= required_safety_deposit
            
            // Update resolver state with new commitment
            verify_commitment_recorded(
              datum, 
              order_hash, 
              partial_amount, 
              tx.outputs
            )
          }
          
          WithdrawEarnings -> {
            // Allow resolver to withdraw their earned fees
            verify_earnings_withdrawn(datum, tx.outputs)
          }
          
          UpdateCommitment { order_hash, new_amount } -> {
            // Allow resolver to update their commitment to an order
            verify_commitment_updated(
              datum, 
              order_hash, 
              new_amount, 
              tx.outputs
            )
          }
        }
      }
      _ -> False
    }
  }
}

fn verify_commitment_recorded(
  datum: ResolverDatum,
  order_hash: ByteArray,
  partial_amount: Int,
  outputs: List<Output>,
) -> Bool {
  // Verify resolver output has updated commitments
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          ResolverDatum(resolver_data) -> 
            resolver_data.resolver == datum.resolver &&
            resolver_data.total_committed == datum.total_committed + partial_amount &&
            list.has(resolver_data.active_orders, order_hash)
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_earnings_withdrawn(
  datum: ResolverDatum,
  outputs: List<Output>,
) -> Bool {
  // Verify resolver earnings are reset and funds withdrawn
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          ResolverDatum(resolver_data) -> 
            resolver_data.resolver == datum.resolver &&
            resolver_data.total_earned == 0 &&
            resolver_data.total_committed == datum.total_committed
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_commitment_updated(
  datum: ResolverDatum,
  order_hash: ByteArray,
  new_amount: Int,
  outputs: List<Output>,
) -> Bool {
  // Verify resolver commitment is updated
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          ResolverDatum(resolver_data) -> 
            resolver_data.resolver == datum.resolver &&
            list.has(resolver_data.active_orders, order_hash)
          _ -> False
        }
      }
      _ -> False
    }
  })
}

use aiken/transaction.{Output}
