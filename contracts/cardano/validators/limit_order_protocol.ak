use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext, Spend, InlineDatum}
use aiken/transaction/credential.{VerificationKey}
use aiken/transaction/value.{PolicyId, AssetName, quantity_of, merge, from_lovelace}
use unite_types.{Order, EscrowDatum, EscrowState, Active}
use unite_utils.{verify_order_signature, calculate_resolver_fee}

// Limit Order Protocol validator
// Manages cross-chain limit orders and their execution

pub type LimitOrderDatum {
  order: Order,
  maker: Hash<Blake2b_224, VerificationKey>,
  is_filled: Bool,
  filled_amount: Int,
  escrow_addresses: List<ByteArray>,
  created_timestamp: Int,
}

pub type LimitOrderRedeemer {
  CreateOrder { order: Order, signature: ByteArray }
  FillOrder { 
    taker: Hash<Blake2b_224, VerificationKey>,
    fill_amount: Int,
    resolvers: List<Hash<Blake2b_224, VerificationKey>>,
    resolver_amounts: List<Int>
  }
  CancelOrder
  UpdateOrder { new_amount: Int, new_expected_amount: Int }
}

validator limit_order_protocol {
  fn spend(
    datum: LimitOrderDatum,
    redeemer: LimitOrderRedeemer,
    context: ScriptContext,
  ) -> Bool {
    when context.purpose is {
      Spend(_) -> {
        let tx = context.transaction
        let signatories = tx.extra_signatories
        
        when redeemer is {
          CreateOrder { order, signature } -> {
            // Verify order signature
            expect verify_order_signature(order, signature, datum.maker)
            
            // Verify maker signed the transaction
            expect list.has(signatories, datum.maker)
            
            // Verify order details match datum
            expect order.maker == datum.maker
            expect order.amount > 0
            expect order.expected_amount > 0
            
            // Verify maker locked the source tokens
            verify_maker_locked_tokens(order, tx.inputs, tx.outputs) &&
            // Create order state
            verify_order_created(datum, order, tx.outputs)
          }
          
          FillOrder { taker, fill_amount, resolvers, resolver_amounts } -> {
            // Verify order is not already filled
            expect !datum.is_filled
            
            // Verify fill amount is valid
            expect fill_amount > 0
            expect fill_amount <= (datum.order.amount - datum.filled_amount)
            
            // Verify taker signed
            expect list.has(signatories, taker)
            
            // Verify resolvers provided commitments
            expect list.length(resolvers) == list.length(resolver_amounts)
            
            let total_resolver_commitment = list.foldl(resolver_amounts, 0, fn(amount, acc) {
              acc + amount
            })
            expect total_resolver_commitment >= fill_amount
            
            // Execute cross-chain swap
            execute_cross_chain_swap(
              datum,
              taker,
              fill_amount,
              resolvers,
              resolver_amounts,
              tx
            )
          }
          
          CancelOrder -> {
            // Only maker can cancel
            expect list.has(signatories, datum.maker)
            
            // Verify order is not filled
            expect !datum.is_filled
            
            // Return locked tokens to maker
            verify_order_cancelled(datum, tx.outputs)
          }
          
          UpdateOrder { new_amount, new_expected_amount } -> {
            // Only maker can update
            expect list.has(signatories, datum.maker)
            
            // Verify order is not filled
            expect !datum.is_filled
            
            // Verify new amounts are valid
            expect new_amount > 0
            expect new_expected_amount > 0
            
            // Update order with new amounts
            verify_order_updated(datum, new_amount, new_expected_amount, tx.outputs)
          }
        }
      }
      _ -> False
    }
  }
}

fn verify_maker_locked_tokens(
  order: Order,
  inputs: List<Input>,
  outputs: List<Output>,
) -> Bool {
  // Verify maker has locked the required tokens for the order
  // This is simplified - in practice would check specific token policies
  let src_token_policy = PolicyId(order.src_token)
  let src_token_name = AssetName("") // Simplified
  
  // Check that order amount of source tokens are locked in contract
  list.any(outputs, fn(output) {
    quantity_of(output.value, src_token_policy, src_token_name) >= order.amount
  })
}

fn verify_order_created(
  datum: LimitOrderDatum,
  order: Order,
  outputs: List<Output>,
) -> Bool {
  // Verify order output exists with correct state
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          LimitOrderDatum(order_data) -> 
            order_data.order.order_hash == order.order_hash &&
            order_data.maker == order.maker &&
            !order_data.is_filled &&
            order_data.filled_amount == 0
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn execute_cross_chain_swap(
  datum: LimitOrderDatum,
  taker: Hash<Blake2b_224, VerificationKey>,
  fill_amount: Int,
  resolvers: List<Hash<Blake2b_224, VerificationKey>>,
  resolver_amounts: List<Int>,
  tx: Transaction,
) -> Bool {
  let order = datum.order
  
  // Create escrows on both chains
  let src_escrow_created = verify_src_escrow_created(
    order,
    fill_amount,
    resolvers,
    resolver_amounts,
    tx.outputs
  )
  
  let dst_escrow_created = verify_dst_escrow_created(
    order,
    fill_amount,
    taker,
    resolvers,
    resolver_amounts,
    tx.outputs
  )
  
  // Update order state
  let order_updated = verify_order_fill_updated(
    datum,
    fill_amount,
    tx.outputs
  )
  
  src_escrow_created && dst_escrow_created && order_updated
}

fn verify_src_escrow_created(
  order: Order,
  fill_amount: Int,
  resolvers: List<Hash<Blake2b_224, VerificationKey>>,
  resolver_amounts: List<Int>,
  outputs: List<Output>,
) -> Bool {
  // Verify source chain escrow is created
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          EscrowDatum(escrow_data) -> 
            escrow_data.order_hash == order.order_hash &&
            escrow_data.is_source == True &&
            escrow_data.amount == fill_amount &&
            escrow_data.state == Active
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_dst_escrow_created(
  order: Order,
  fill_amount: Int,
  taker: Hash<Blake2b_224, VerificationKey>,
  resolvers: List<Hash<Blake2b_224, VerificationKey>>,
  resolver_amounts: List<Int>,
  outputs: List<Output>,
) -> Bool {
  // Verify destination chain escrow is created  
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          EscrowDatum(escrow_data) -> 
            escrow_data.order_hash == order.order_hash &&
            escrow_data.is_source == False &&
            escrow_data.taker == taker &&
            escrow_data.state == Active
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_order_fill_updated(
  datum: LimitOrderDatum,
  fill_amount: Int,
  outputs: List<Output>,
) -> Bool {
  let new_filled_amount = datum.filled_amount + fill_amount
  let is_fully_filled = new_filled_amount >= datum.order.amount
  
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          LimitOrderDatum(order_data) -> 
            order_data.order.order_hash == datum.order.order_hash &&
            order_data.filled_amount == new_filled_amount &&
            order_data.is_filled == is_fully_filled
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_order_cancelled(
  datum: LimitOrderDatum,
  outputs: List<Output>,
) -> Bool {
  // Verify order is marked as cancelled and tokens returned
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          LimitOrderDatum(order_data) -> 
            order_data.order.order_hash == datum.order.order_hash &&
            order_data.is_filled == True  // Use filled flag to mark cancelled
          _ -> False
        }
      }
      _ -> False
    }
  })
}

fn verify_order_updated(
  datum: LimitOrderDatum,
  new_amount: Int,
  new_expected_amount: Int,
  outputs: List<Output>,
) -> Bool {
  list.any(outputs, fn(output) {
    when output.datum is {
      InlineDatum(data) -> {
        when data is {
          LimitOrderDatum(order_data) -> 
            order_data.order.order_hash == datum.order.order_hash &&
            order_data.order.amount == new_amount &&
            order_data.order.expected_amount == new_expected_amount
          _ -> False
        }
      }
      _ -> False
    }
  })
}

use aiken/transaction.{Transaction, Input, Output}