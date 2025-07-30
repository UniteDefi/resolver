#[cfg(all(target_arch = "wasm32", not(feature = "no-contract")))]
pub mod simple_relayer;

#[cfg(all(target_arch = "wasm32", not(feature = "no-contract")))]
pub mod simple_escrow;