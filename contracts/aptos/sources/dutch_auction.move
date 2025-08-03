module aptos_addr::dutch_auction {
    use aptos_framework::timestamp;

    // Error codes
    const E_AUCTION_NOT_STARTED: u64 = 1;
    const E_INVALID_AUCTION_PARAMETERS: u64 = 2;

    // Constants for decimal precision
    const PRICE_PRECISION: u64 = 1000000; // 6 decimals for Aptos
    const EVM_PRECISION: u64 = 1000000000000000000; // 18 decimals for EVM
    const DECIMAL_CONVERSION_FACTOR: u64 = 1000000000000; // EVM_PRECISION / PRICE_PRECISION

    /**
     * Calculate the current price based on Dutch auction parameters
     * Prices are expected in 6 decimal precision for Aptos
     */
    public fun get_current_price(
        start_price: u64,
        end_price: u64,
        auction_start_time: u64,
        auction_end_time: u64,
    ): u64 {
        let current_time = timestamp::now_seconds();
        
        if (current_time < auction_start_time) {
            abort E_AUCTION_NOT_STARTED
        };
        
        if (current_time >= auction_end_time) {
            return end_price
        };
        
        if (auction_end_time <= auction_start_time || start_price <= end_price) {
            abort E_INVALID_AUCTION_PARAMETERS
        };
        
        let time_elapsed = current_time - auction_start_time;
        let total_duration = auction_end_time - auction_start_time;
        let price_decrease = start_price - end_price;
        
        // Linear price decay: currentPrice = startPrice - (priceDecrease * timeElapsed / totalDuration)
        start_price - (price_decrease * time_elapsed / total_duration)
    }

    /**
     * Calculate the taking amount based on current auction price
     * For cross-chain compatibility with EVM
     */
    public fun calculate_taking_amount(
        making_amount: u64,
        start_price: u64,
        end_price: u64,
        auction_start_time: u64,
        auction_end_time: u64,
    ): u64 {
        let current_price = get_current_price(
            start_price,
            end_price,
            auction_start_time,
            auction_end_time
        );
        
        // takingAmount = makingAmount * currentPrice / PRICE_PRECISION
        (making_amount * current_price) / PRICE_PRECISION
    }

    /**
     * Convert price from EVM format (18 decimals) to Aptos format (6 decimals)
     */
    public fun convert_price_from_evm(evm_price: u64): u64 {
        evm_price / DECIMAL_CONVERSION_FACTOR
    }

    /**
     * Convert price from Aptos format (6 decimals) to EVM format (18 decimals)
     */
    public fun convert_price_to_evm(aptos_price: u64): u64 {
        aptos_price * DECIMAL_CONVERSION_FACTOR
    }

    /**
     * Convert amount based on token decimals
     * For USDT/USDC: EVM uses 6 decimals, Aptos uses 6 decimals (no conversion needed)
     * For DAI/ETH: EVM uses 18 decimals, Aptos uses 8 decimals
     */
    public fun convert_amount_from_evm(evm_amount: u64, evm_decimals: u8, aptos_decimals: u8): u64 {
        if (evm_decimals == aptos_decimals) {
            return evm_amount
        };
        
        if (evm_decimals > aptos_decimals) {
            let divisor = 1u64;
            let diff = evm_decimals - aptos_decimals;
            let i = 0;
            while (i < diff) {
                divisor = divisor * 10;
                i = i + 1;
            };
            evm_amount / divisor
        } else {
            let multiplier = 1u64;
            let diff = aptos_decimals - evm_decimals;
            let i = 0;
            while (i < diff) {
                multiplier = multiplier * 10;
                i = i + 1;
            };
            evm_amount * multiplier
        }
    }

    /**
     * Calculate taking amount for cross-chain order with proper decimal handling
     */
    public fun calculate_cross_chain_taking_amount(
        making_amount: u64,
        start_price: u64, // Already in Aptos format (6 decimals)
        end_price: u64,   // Already in Aptos format (6 decimals)
        auction_start_time: u64,
        auction_end_time: u64,
        making_decimals: u8,
        taking_decimals: u8,
    ): u64 {
        // Get current price in Aptos format
        let current_price = get_current_price(
            start_price,
            end_price,
            auction_start_time,
            auction_end_time
        );
        
        // Calculate base taking amount
        let base_taking_amount = (making_amount * current_price) / PRICE_PRECISION;
        
        // Adjust for decimal differences between making and taking assets
        if (making_decimals == taking_decimals) {
            base_taking_amount
        } else if (making_decimals > taking_decimals) {
            let divisor = 1u64;
            let diff = making_decimals - taking_decimals;
            let i = 0;
            while (i < diff) {
                divisor = divisor * 10;
                i = i + 1;
            };
            base_taking_amount / divisor
        } else {
            let multiplier = 1u64;
            let diff = taking_decimals - making_decimals;
            let i = 0;
            while (i < diff) {
                multiplier = multiplier * 10;
                i = i + 1;
            };
            base_taking_amount * multiplier
        }
    }
}