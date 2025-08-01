use cardano/address.{Credential, VerificationKeyCredential}
use cardano/transaction.{Transaction, OutputReference, find_input}
use aiken/list

pub type Datum {
  owner: Credential,
  counter: Int,
}

pub type Redeemer {
  Increment
  Decrement
}

validator counter {
  spend(datum: Option<Datum>, redeemer: Redeemer, utxo: OutputReference, self: Transaction) {
    expect Some(datum) = datum
    
    // Find the input and output for this script
    expect Some(input) = find_input(self.inputs, utxo)
    let script_address = input.output.address
    
    // Find output going back to script
    let script_outputs = list.filter(self.outputs, fn(output) { output.address == script_address })
    expect [output] = script_outputs
    expect Some(output_datum): Option<Datum> = output.datum
    
    // Verify owner hasn't changed
    let owner_unchanged = datum.owner == output_datum.owner
    
    // Verify counter operation
    let counter_valid = when redeemer is {
      Increment -> output_datum.counter == datum.counter + 1
      Decrement -> datum.counter > 0 && output_datum.counter == datum.counter - 1
    }
    
    // Check if transaction is signed by owner
    let signed_by_owner = when datum.owner is {
      VerificationKeyCredential(vk) -> list.has(self.extra_signatories, vk)
      _ -> False
    }
    
    owner_unchanged && counter_valid && signed_by_owner
  }
}