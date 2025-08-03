module unite::dutch_auction {
    use sui::clock::{Self, Clock};
    
    // === Errors ===
    const EAuctionNotStarted: u64 = 1;
    const EInvalidAuctionParameters: u64 = 2;
    const EInvalidPriceParameters: u64 = 3;
    
    /// Calculate the current price based on Dutch auction parameters
    /// @param start_price The starting price (higher) in 18 decimal precision
    /// @param end_price The ending price (lower) in 18 decimal precision
    /// @param auction_start_time When the auction started (seconds)
    /// @param auction_end_time When the auction ends (seconds)
    /// @param clock Current time reference
    /// @return current_price The current price based on linear decay (18 decimals)
    public fun get_current_price(
        start_price: u256,
        end_price: u256,
        auction_start_time: u256,
        auction_end_time: u256,
        clock: &Clock
    ): u256 {
        let current_time = (clock::timestamp_ms(clock) / 1000) as u256;
        
        // Check auction has started
        assert!(current_time >= auction_start_time, EAuctionNotStarted);
        
        // If auction has ended, return end price
        if (current_time >= auction_end_time) {
            return end_price
        };
        
        // Validate parameters
        assert!(auction_end_time > auction_start_time, EInvalidAuctionParameters);
        assert!(start_price > end_price, EInvalidPriceParameters);
        
        let time_elapsed = current_time - auction_start_time;
        let total_duration = auction_end_time - auction_start_time;
        let price_decrease = start_price - end_price;
        
        // Linear price decay: currentPrice = startPrice - (priceDecrease * timeElapsed / totalDuration)
        let price_reduction = (price_decrease * time_elapsed) / total_duration;
        start_price - price_reduction
    }
    
    /// Calculate the taking amount based on current auction price
    /// @param making_amount The amount being made (sold)
    /// @param start_price The starting price in 18 decimal precision
    /// @param end_price The ending price in 18 decimal precision
    /// @param auction_start_time When the auction started (seconds)
    /// @param auction_end_time When the auction ends (seconds)
    /// @param clock Current time reference
    /// @return taking_amount The amount to be taken (bought) at current price
    public fun calculate_taking_amount(
        making_amount: u256,
        start_price: u256,
        end_price: u256,
        auction_start_time: u256,
        auction_end_time: u256,
        clock: &Clock
    ): u256 {
        let current_price = get_current_price(
            start_price,
            end_price,
            auction_start_time,
            auction_end_time,
            clock
        );
        
        // takingAmount = makingAmount * currentPrice / 1e18 (18 decimal precision)
        (making_amount * current_price) / 1_000_000_000_000_000_000
    }
    
    /// Calculate the taking amount for a specific timestamp (for testing or verification)
    public fun calculate_taking_amount_at_time(
        making_amount: u256,
        start_price: u256,
        end_price: u256,
        auction_start_time: u256,
        auction_end_time: u256,
        current_time: u256
    ): u256 {
        // Check auction has started
        assert!(current_time >= auction_start_time, EAuctionNotStarted);
        
        // If auction has ended, use end price
        let price = if (current_time >= auction_end_time) {
            end_price
        } else {
            // Validate parameters
            assert!(auction_end_time > auction_start_time, EInvalidAuctionParameters);
            assert!(start_price > end_price, EInvalidPriceParameters);
            
            let time_elapsed = current_time - auction_start_time;
            let total_duration = auction_end_time - auction_start_time;
            let price_decrease = start_price - end_price;
            
            // Linear price decay
            let price_reduction = (price_decrease * time_elapsed) / total_duration;
            start_price - price_reduction
        };
        
        // takingAmount = makingAmount * price / 1e18
        (making_amount * price) / 1_000_000_000_000_000_000
    }
}