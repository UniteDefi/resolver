use starknet::get_block_timestamp;

pub fn get_current_price(
    start_price: u256,
    end_price: u256,
    auction_start_time: u64,
    auction_end_time: u64,
    current_time: u64
) -> u256 {
    assert(current_time >= auction_start_time, 'Auction not started');
    
    if current_time >= auction_end_time {
        return end_price;
    }
    
    assert(auction_end_time > auction_start_time, 'Invalid auction params');
    assert(start_price > end_price, 'Invalid price params');
    
    let time_elapsed = current_time - auction_start_time;
    let total_duration = auction_end_time - auction_start_time;
    let price_decrease = start_price - end_price;
    
    // Linear price decay
    start_price - (price_decrease * time_elapsed.into()) / total_duration.into()
}

pub fn calculate_taking_amount(
    making_amount: u256,
    start_price: u256,
    end_price: u256,
    auction_start_time: u64,
    auction_end_time: u64,
    current_time: u64
) -> u256 {
    let current_price = get_current_price(
        start_price,
        end_price,
        auction_start_time,
        auction_end_time,
        current_time
    );
    
    (making_amount * current_price) / 1000000000000000000_u256 // 1e18
}
