use cosmwasm_std::{StdError, StdResult, Uint128};

pub struct DutchAuction;

impl DutchAuction {
    /// Calculate the current price based on Dutch auction parameters
    pub fn get_current_price(
        start_price: Uint128,
        end_price: Uint128,
        auction_start_time: u64,
        auction_end_time: u64,
        current_time: u64,
    ) -> StdResult<Uint128> {
        if current_time < auction_start_time {
            return Err(StdError::generic_err("Auction not started"));
        }
        
        if current_time >= auction_end_time {
            return Ok(end_price);
        }
        
        if auction_end_time <= auction_start_time || start_price <= end_price {
            return Err(StdError::generic_err("Invalid auction parameters"));
        }
        
        let time_elapsed = current_time - auction_start_time;
        let total_duration = auction_end_time - auction_start_time;
        let price_decrease = start_price.checked_sub(end_price)?;
        
        // Linear price decay: currentPrice = startPrice - (priceDecrease * timeElapsed / totalDuration)
        let price_reduction = price_decrease
            .checked_mul(Uint128::from(time_elapsed))?
            .checked_div(Uint128::from(total_duration))?;
            
        Ok(start_price.checked_sub(price_reduction)?)
    }
    
    /// Calculate the taking amount based on current auction price
    pub fn calculate_taking_amount(
        making_amount: Uint128,
        start_price: Uint128,
        end_price: Uint128,
        auction_start_time: u64,
        auction_end_time: u64,
        current_time: u64,
    ) -> StdResult<Uint128> {
        let current_price = Self::get_current_price(
            start_price,
            end_price,
            auction_start_time,
            auction_end_time,
            current_time,
        )?;
        
        // takingAmount = makingAmount * currentPrice / 10^18 (assuming 18 decimal precision)
        let precision = Uint128::from(10u128.pow(18));
        Ok(making_amount
            .checked_mul(current_price)?
            .checked_div(precision)?)
    }
}