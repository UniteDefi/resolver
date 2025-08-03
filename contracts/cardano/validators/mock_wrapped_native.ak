use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext, Mint, InlineDatum}
use aiken/transaction/credential.{VerificationKey}
use aiken/transaction/value.{PolicyId, AssetName, quantity_of, lovelace_of}

// Mock Wrapped Native token minting policy
// This simulates wrapping native ADA but with a fake mint function
// In reality, wrapped native tokens should be backed 1:1 by native assets

pub type MockWrappedRedeemer {
  Mint { amount: Int, recipient: Hash<Blake2b_224, VerificationKey> }
  Burn { amount: Int }
  FakeMint { amount: Int, recipient: Hash<Blake2b_224, VerificationKey> }  // Testing only
}

validator mock_wrapped_native {
  fn mint(
    redeemer: MockWrappedRedeemer,
    context: ScriptContext,
  ) -> Bool {
    when context.purpose is {
      Mint(policy_id) -> {
        let tx = context.transaction
        let signatories = tx.extra_signatories
        
        when redeemer is {
          Mint { amount, recipient } -> {
            // Verify user locked equivalent ADA
            expect amount > 0
            
            let ada_locked = calculate_ada_locked_in_transaction(tx.inputs, tx.outputs)
            expect ada_locked >= amount
            
            // Verify the minted amount matches the transaction
            verify_mint_amount(policy_id, "WADA", amount, tx.mint) &&
            // Verify recipient receives the tokens
            verify_recipient_receives_tokens(recipient, policy_id, "WADA", amount, tx.outputs)
          }
          
          Burn { amount } -> {
            // Allow burning of wrapped tokens and return ADA
            expect amount > 0
            
            // Verify the burned amount is negative in mint field
            verify_burn_amount(policy_id, "WADA", amount, tx.mint) &&
            // Verify equivalent ADA is returned
            verify_ada_returned(amount, tx.outputs)
          }
          
          FakeMint { amount, recipient } -> {
            // For testing purposes only - allows minting without backing
            // This should NEVER be used in production
            expect amount > 0
            
            // Verify the minted amount matches the transaction
            verify_mint_amount(policy_id, "WADA", amount, tx.mint) &&
            // Verify recipient receives the tokens
            verify_recipient_receives_tokens(recipient, policy_id, "WADA", amount, tx.outputs)
          }
        }
      }
      _ -> False
    }
  }
}

fn verify_mint_amount(
  policy_id: PolicyId,
  token_name: ByteArray,
  expected_amount: Int,
  mint_value: Value,
) -> Bool {
  let asset_name = AssetName(token_name)
  let minted_amount = quantity_of(mint_value, policy_id, asset_name)
  minted_amount == expected_amount
}

fn verify_burn_amount(
  policy_id: PolicyId,
  token_name: ByteArray,
  expected_amount: Int,
  mint_value: Value,
) -> Bool {
  let asset_name = AssetName(token_name)
  let burned_amount = quantity_of(mint_value, policy_id, asset_name)
  burned_amount == -expected_amount
}

fn verify_recipient_receives_tokens(
  recipient: Hash<Blake2b_224, VerificationKey>,
  policy_id: PolicyId,
  token_name: ByteArray,
  amount: Int,
  outputs: List<Output>,
) -> Bool {
  let asset_name = AssetName(token_name)
  
  list.any(outputs, fn(output) {
    when output.address.payment_credential is {
      VerificationKeyCredential(pkh) -> {
        pkh == recipient &&
        quantity_of(output.value, policy_id, asset_name) >= amount
      }
      _ -> False
    }
  })
}

fn calculate_ada_locked_in_transaction(
  inputs: List<Input>,
  outputs: List<Output>,
) -> Int {
  let total_input_ada = list.foldl(inputs, 0, fn(input, acc) {
    acc + lovelace_of(input.output.value)
  })
  
  let total_output_ada = list.foldl(outputs, 0, fn(output, acc) {
    acc + lovelace_of(output.value)
  })
  
  // Return the net ADA locked (input - output, should be positive for wrapping)
  total_input_ada - total_output_ada
}

fn verify_ada_returned(
  amount: Int,
  outputs: List<Output>,
) -> Bool {
  // Simplified check - in practice would verify specific ADA return
  list.any(outputs, fn(output) {
    lovelace_of(output.value) >= amount
  })
}

use aiken/transaction.{Output, Value, Input}
use aiken/transaction/credential.{VerificationKeyCredential}