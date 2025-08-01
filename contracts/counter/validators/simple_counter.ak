pub type Datum {
  counter: Int,
}

pub type Redeemer {
  Increment
  Decrement
}

validator simple_counter {
  spend(datum: Option<Datum>, redeemer: Redeemer, _utxo, _self) {
    expect Some(datum) = datum
    
    when redeemer is {
      Increment -> True
      Decrement -> datum.counter > 0
    }
  }
}