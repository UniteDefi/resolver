use soroban_sdk::{contracttype, contracterror, Address, BytesN};

// Constants
pub const CALLER_REWARD_PERCENTAGE: u32 = 10;
pub const DECIMAL_FACTOR: i128 = 1_000_000; // 10^6 for 6 decimals (USDT/DAI)
pub const EVM_DECIMAL_FACTOR: i128 = 1_000_000_000_000_000_000; // 10^18 for EVM compatibility

// Error codes
#[contracterror]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum Error {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    InvalidSecret = 3,
    InvalidTime = 4,
    InvalidCaller = 5,
    AlreadyWithdrawn = 6,
    InvalidAmount = 7,
    InvalidImmutables = 8,
    TransferFailed = 9,
    InsufficientBalance = 10,
    ResolverAlreadyAdded = 11,
    InvalidState = 12,
    NotAllResolversDeposited = 13,
    InvalidPrice = 14,
    OrderCompleted = 15,
}

// State enum
#[contracttype]
#[derive(Clone, Copy)]
#[repr(u32)]
pub enum State {
    Active = 0,
    Withdrawn = 1,
    Cancelled = 2,
}

// Order structure - matching EVM structure
#[contracttype]
#[derive(Clone)]
pub struct Order {
    pub salt: u128,
    pub maker: BytesN<32>, // EVM address as bytes
    pub receiver: BytesN<32>,
    pub maker_asset: BytesN<32>,
    pub taker_asset: BytesN<32>,
    pub making_amount: u128,
    pub taking_amount: u128,
    pub deadline: u64,
    pub nonce: u128,
    pub src_chain_id: u128,
    pub dst_chain_id: u128,
    pub auction_start_time: u64,
    pub auction_end_time: u64,
    pub start_price: u128, // Price with 18 decimals for EVM compatibility
    pub end_price: u128,
}

// Immutables structure
#[contracttype]
#[derive(Clone)]
pub struct Immutables {
    pub order_hash: BytesN<32>,
    pub hashlock: BytesN<32>,
    pub maker: Address, // Stellar address
    pub taker: Address,
    pub token: Address,
    pub amount: i128, // Using i128 for Stellar token amounts
    pub safety_deposit: i128,
    pub timelocks: u128, // Encoded timelocks
}

// Timelocks helper
#[contracttype]
pub struct Timelocks {
    pub deployed_at: u64,
    pub src_withdrawal: u64,
    pub src_public_withdrawal: u64,
    pub src_cancellation: u64,
    pub src_public_cancellation: u64,
    pub dst_withdrawal: u64,
    pub dst_public_withdrawal: u64,
    pub dst_cancellation: u64,
}

impl Timelocks {
    pub fn decode(encoded: u128, deployed_at: u64) -> Self {
        // Extract 32-bit values from the encoded u128
        let src_withdrawal = (encoded & 0xFFFFFFFF) as u64;
        let src_public_withdrawal = ((encoded >> 32) & 0xFFFFFFFF) as u64;
        let src_cancellation = ((encoded >> 64) & 0xFFFFFFFF) as u64;
        let src_public_cancellation = ((encoded >> 96) & 0xFFFFFFFF) as u64;
        
        // For higher bits, we need to work around u128 shift limitations
        // Convert to bytes and extract manually
        let bytes = encoded.to_be_bytes();
        
        // Extract dst_withdrawal (bits 128-159 -> bytes 12-15)
        let dst_withdrawal = u32::from_be_bytes([bytes[12], bytes[13], bytes[14], bytes[15]]) as u64;
        
        // Extract dst_public_withdrawal (bits 160-191 -> bytes 8-11)
        let dst_public_withdrawal = u32::from_be_bytes([bytes[8], bytes[9], bytes[10], bytes[11]]) as u64;
        
        // Extract dst_cancellation (bits 192-223 -> bytes 4-7)
        let dst_cancellation = u32::from_be_bytes([bytes[4], bytes[5], bytes[6], bytes[7]]) as u64;
        
        Timelocks {
            deployed_at,
            src_withdrawal,
            src_public_withdrawal,
            src_cancellation,
            src_public_cancellation,
            dst_withdrawal,
            dst_public_withdrawal,
            dst_cancellation,
        }
    }
}