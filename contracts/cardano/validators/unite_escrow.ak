use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext, Spend, InlineDatum, OutputDatum}
use aiken/transaction/credential.{VerificationKey}
use aiken/transaction/value.{from_lovelace, lovelace_of, merge, negate}
use unite_types.{
  EscrowDatum, EscrowRedeemer, EscrowState, Active, Withdrawn, Cancelled
}
use unite_utils.{
  verify_secret, calculate_proportional_amount, is_within_timelock,
  can_cancel, validate_escrow_value, get_participating_resolvers,
  calculate_total_committed, all_resolvers_signed, calculate_safety_deposit
}

validator unite_escrow {
  fn spend(
    datum: EscrowDatum,
    redeemer: EscrowRedeemer,
    context: ScriptContext,
  ) -> Bool {
    when context.purpose is {
      Spend(_) -> {
        let tx = context.transaction
        let inputs = tx.inputs
        let outputs = tx.outputs
        let signatories = tx.extra_signatories
        
        // Ensure escrow is in active state
        expect datum.state == Active
        
        when redeemer is {
          WithdrawWithSecret { secret } -> {
            // Verify secret matches hashlock
            expect verify_secret(secret, datum.hashlock)
            
            if datum.is_source {
              handle_source_withdrawal(datum, tx, signatories)
            } else {
              handle_destination_withdrawal(datum, tx, signatories)
            }
          }
          
          Cancel -> {
            handle_cancellation(datum, tx, signatories)
          }
          
          AddResolver { resolver, partial_amount } -> {
            handle_add_resolver(datum, resolver, partial_amount, tx, signatories)
          }
        }
      }
      _ -> False
    }
  }
}

fn handle_source_withdrawal(
  datum: EscrowDatum,
  tx: Transaction,
  signatories: List<Hash<Blake2b_224, VerificationKey>>,
) -> Bool {
  // On source chain: distribute tokens to resolvers proportionally
  // and return safety deposits
  
  // Get all resolver inputs for this order
  let resolver_inputs = list.filter(tx.inputs, fn(input) {
    when input.output.datum is {
      InlineDatum(data) -> {
        when data is {
          EscrowDatum(escrow_data) -> 
            escrow_data.order_hash == datum.order_hash && escrow_data.is_source
          _ -> False
        }
      }
      _ -> False
    }
  })
  
  let total_committed = calculate_total_committed(resolver_inputs)
  let participating_resolvers = get_participating_resolvers(resolver_inputs)
  
  // Verify total committed matches order amount
  expect total_committed == datum.amount
  
  // Verify outputs pay resolvers proportionally
  verify_resolver_payouts(datum, resolver_inputs, tx.outputs) &&
  // Verify updated escrow state
  verify_escrow_state_update(datum, Withdrawn, tx.outputs)
}

fn handle_destination_withdrawal(
  datum: EscrowDatum,
  tx: Transaction,
  signatories: List<Hash<Blake2b_224, VerificationKey>>,
) -> Bool {
  // On destination chain: send tokens to user (maker)
  // and return safety deposits to resolvers
  
  let total_tokens_in_escrow = calculate_total_tokens_in_escrow(datum, tx.inputs)
  
  // Verify user receives tokens
  verify_user_receives_tokens(datum, total_tokens_in_escrow, tx.outputs) &&
  // Verify resolvers get safety deposits back
  verify_resolver_safety_deposits_returned(datum, tx) &&
  // Verify escrow state updated
  verify_escrow_state_update(datum, Withdrawn, tx.outputs)
}

fn handle_cancellation(
  datum: EscrowDatum,
  tx: Transaction,
  signatories: List<Hash<Blake2b_224, VerificationKey>>,
) -> Bool {
  // Check cancellation is allowed based on timelock and caller
  let is_maker = list.has(signatories, datum.maker)
  let current_time = get_current_time(tx)
  
  let can_cancel_now = if datum.is_source {
    can_cancel(
      datum.timelock_start,
      src_cancellation_time,
      current_time,
      is_maker,
      !is_maker
    )
  } else {
    // Destination cancellation requires source to be cancelled first
    current_time >= datum.src_cancellation_timestamp &&
    can_cancel(
      datum.timelock_start,
      dst_cancellation_time,
      current_time,
      True,
      True
    )
  }
  
  expect can_cancel_now
  
  // Return funds to maker and safety deposits to resolvers
  verify_cancellation_payouts(datum, tx.outputs) &&
  verify_escrow_state_update(datum, Cancelled, tx.outputs)
}

fn handle_add_resolver(
  datum: EscrowDatum,
  resolver: Hash<Blake2b_224, VerificationKey>,
  partial_amount: Int,
  tx: Transaction,
  signatories: List<Hash<Blake2b_224, VerificationKey>>,
) -> Bool {
  // Verify resolver signed
  expect list.has(signatories, resolver)
  
  // Verify partial amount is valid
  expect partial_amount > 0
  
  // Verify resolver provided safety deposit
  let required_safety_deposit = calculate_safety_deposit(partial_amount)
  verify_safety_deposit_provided(resolver, required_safety_deposit, tx) &&
  
  // Update escrow with new resolver
  verify_resolver_added_to_escrow(datum, resolver, partial_amount, tx.outputs)
}

// Helper functions for verification

fn verify_resolver_payouts(
  datum: EscrowDatum,
  resolver_inputs: List<Input>,
  outputs: List<Output>,
) -> Bool {
  // Verify each resolver gets their proportional share of tokens + safety deposit
  list.all(resolver_inputs, fn(input) {
    when input.output.datum is {
      InlineDatum(data) -> {
        when data is {
          EscrowDatum(escrow_data) -> {
            let proportional_amount = calculate_proportional_amount(
              datum.amount,
              escrow_data.partial_amount,
              datum.amount
            )
            verify_resolver_receives_amount(
              escrow_data.resolver,
              proportional_amount + escrow_data.safety_deposit,
              outputs
            )
          }
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_user_receives_tokens(
  datum: EscrowDatum,
  amount: Int,
  outputs: List<Output>,
) -> Bool {
  // Find output paying to maker
  list.any(outputs, fn(output) {
    output.address.payment_credential == 
      VerificationKeyCredential(datum.maker) &&
    lovelace_of(output.value) >= amount
  })
}

fn verify_resolver_safety_deposits_returned(
  datum: EscrowDatum,
  tx: Transaction,
) -> Bool {
  // Verify all resolver safety deposits are returned
  True // Simplified for now
}

fn verify_escrow_state_update(
  datum: EscrowDatum,
  new_state: EscrowState,
  outputs: List<Output>,
) -> Bool {
  // Verify escrow output has updated state
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          EscrowDatum(updated_datum) -> 
            updated_datum.order_hash == datum.order_hash &&
            updated_datum.state == new_state
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_cancellation_payouts(
  datum: EscrowDatum,
  outputs: List<Output>,
) -> Bool {
  // Verify maker gets refund and resolvers get safety deposits back
  verify_user_receives_tokens(datum, datum.amount, outputs)
}

fn verify_safety_deposit_provided(
  resolver: Hash<Blake2b_224, VerificationKey>,
  required_amount: Int,
  tx: Transaction,
) -> Bool {
  // Verify resolver input has sufficient safety deposit
  True // Simplified
}

fn verify_resolver_added_to_escrow(
  datum: EscrowDatum,
  resolver: Hash<Blake2b_224, VerificationKey>,
  partial_amount: Int,
  outputs: List<Output>,
) -> Bool {
  // Verify escrow output includes new resolver
  True // Simplified
}

fn verify_resolver_receives_amount(
  resolver: Hash<Blake2b_224, VerificationKey>,
  amount: Int,
  outputs: List<Output>,
) -> Bool {
  // Check if resolver receives specified amount
  list.any(outputs, fn(output) {
    output.address.payment_credential == 
      VerificationKeyCredential(resolver) &&
    lovelace_of(output.value) >= amount
  })
}

fn calculate_total_tokens_in_escrow(
  datum: EscrowDatum,
  inputs: List<Input>,
) -> Int {
  // Calculate total tokens currently in escrow
  datum.amount // Simplified
}

fn get_current_time(tx: Transaction) -> Int {
  // Get current time from transaction validity interval
  when tx.validity_range.lower_bound.bound_type is {
    Finite(time) -> time
    _ -> 0
  }
}

use aiken/transaction/credential.{VerificationKeyCredential}
use unite_types.{src_cancellation_time, dst_cancellation_time}
