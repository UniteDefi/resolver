const TIMELOCK_MASK: u256 = 0xffffffff;
const DEPLOYED_AT_OFFSET: u8 = 224;

pub fn set_deployed_at(timelocks: u256, timestamp: u64) -> u256 {
    let timestamp_shifted = u256 { low: 0, high: timestamp.into() } << DEPLOYED_AT_OFFSET;
    let mask = !(u256 { low: 0, high: 0xffffffff } << DEPLOYED_AT_OFFSET);
    (timelocks & mask) | timestamp_shifted
}

pub fn get_deployed_at(timelocks: u256) -> u32 {
    (timelocks >> DEPLOYED_AT_OFFSET).try_into().unwrap()
}

pub fn src_withdrawal(timelocks: u256) -> u32 {
    (timelocks & TIMELOCK_MASK).try_into().unwrap()
}

pub fn src_public_withdrawal(timelocks: u256) -> u32 {
    ((timelocks >> 32) & TIMELOCK_MASK).try_into().unwrap()
}

pub fn src_cancellation(timelocks: u256) -> u32 {
    ((timelocks >> 64) & TIMELOCK_MASK).try_into().unwrap()
}

pub fn src_public_cancellation(timelocks: u256) -> u32 {
    ((timelocks >> 96) & TIMELOCK_MASK).try_into().unwrap()
}

pub fn dst_withdrawal(timelocks: u256) -> u32 {
    ((timelocks >> 128) & TIMELOCK_MASK).try_into().unwrap()
}

pub fn dst_public_withdrawal(timelocks: u256) -> u32 {
    ((timelocks >> 160) & TIMELOCK_MASK).try_into().unwrap()
}

pub fn dst_cancellation(timelocks: u256) -> u32 {
    ((timelocks >> 192) & TIMELOCK_MASK).try_into().unwrap()
}
