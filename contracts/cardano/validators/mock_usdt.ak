use aiken/hash.{Blake2b_224, Hash}
use aiken/list
use aiken/transaction.{ScriptContext, Mint, InlineDatum}
use aiken/transaction/credential.{VerificationKey}
use aiken/transaction/value.{PolicyId, AssetName, quantity_of}

// Mock USDT token minting policy
// This is a simplified token for testing purposes

pub type MockTokenRedeemer {
  Mint { amount: Int, recipient: Hash<Blake2b_224, VerificationKey> }
  Burn { amount: Int }
}

validator mock_usdt {
  fn mint(
    redeemer: MockTokenRedeemer,
    context: ScriptContext,
  ) -> Bool {
    when context.purpose is {
      Mint(policy_id) -> {
        let tx = context.transaction
        let signatories = tx.extra_signatories
        
        when redeemer is {
          Mint { amount, recipient } -> {
            // For testing purposes, allow anyone to mint
            // In production, this would have proper authorization
            expect amount > 0
            
            // Verify the minted amount matches the transaction
            verify_mint_amount(policy_id, "USDT", amount, tx.mint) &&
            // Verify recipient receives the tokens
            verify_recipient_receives_tokens(recipient, policy_id, "USDT", amount, tx.outputs)
          }
          
          Burn { amount } -> {
            // Allow burning of tokens
            expect amount > 0
            
            // Verify the burned amount is negative in mint field
            verify_burn_amount(policy_id, "USDT", amount, tx.mint)
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

use aiken/transaction.{Output, Value}
use aiken/transaction/credential.{VerificationKeyCredential}