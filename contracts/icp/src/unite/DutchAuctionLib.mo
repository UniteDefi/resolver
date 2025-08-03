import Time "mo:base/Time";
import Nat "mo:base/Nat";
import Int "mo:base/Int";
import Types "./types";

module DutchAuctionLib {
    
    private let SCALE_FACTOR : Nat = 1_000_000_000_000_000_000; // 1e18 for price scaling
    
    // Calculate the current price based on Dutch auction parameters
    public func getCurrentPrice(
        startPrice: Nat,
        endPrice: Nat,
        auctionStartTime: Time.Time,
        auctionEndTime: Time.Time,
        currentTime: Time.Time
    ) : Types.Result<Nat, Types.Error> {
        // Convert Time.Time (nanoseconds) to seconds for comparison
        let currentTimeSec = currentTime / 1_000_000_000;
        let auctionStartTimeSec = auctionStartTime / 1_000_000_000;
        let auctionEndTimeSec = auctionEndTime / 1_000_000_000;
        
        if (currentTimeSec < auctionStartTimeSec) {
            return #Err(#AuctionNotStarted);
        };
        
        if (currentTimeSec >= auctionEndTimeSec) {
            return #Ok(endPrice);
        };
        
        if (auctionEndTimeSec <= auctionStartTimeSec or startPrice <= endPrice) {
            return #Err(#InvalidAuctionParameters);
        };
        
        let timeElapsed = Int.abs(currentTimeSec - auctionStartTimeSec);
        let totalDuration = Int.abs(auctionEndTimeSec - auctionStartTimeSec);
        let priceDecrease = startPrice - endPrice;
        
        // Linear price decay: currentPrice = startPrice - (priceDecrease * timeElapsed / totalDuration)
        // Use overflow-safe operations
        let priceDrop = if (priceDecrease > 0 and timeElapsed > 0 and totalDuration > 0) {
            (priceDecrease * timeElapsed) / totalDuration
        } else {
            0
        };
        let currentPrice = if (startPrice >= priceDrop) {
            startPrice - priceDrop
        } else {
            endPrice
        };
        
        #Ok(currentPrice);
    };
    
    // Calculate the taking amount based on current auction price
    public func calculateTakingAmount(
        makingAmount: Nat,
        startPrice: Nat,
        endPrice: Nat,
        auctionStartTime: Time.Time,
        auctionEndTime: Time.Time,
        currentTime: Time.Time
    ) : Types.Result<Nat, Types.Error> {
        switch (getCurrentPrice(startPrice, endPrice, auctionStartTime, auctionEndTime, currentTime)) {
            case (#Ok(currentPrice)) {
                // takingAmount = makingAmount * currentPrice / SCALE_FACTOR
                let takingAmount = (makingAmount * currentPrice) / SCALE_FACTOR;
                #Ok(takingAmount);
            };
            case (#Err(error)) {
                #Err(error);
            };
        };
    };
    
    // Helper function to check if auction has started
    public func hasAuctionStarted(auctionStartTime: Time.Time, currentTime: Time.Time) : Bool {
        let currentTimeSec = currentTime / 1_000_000_000;
        let auctionStartTimeSec = auctionStartTime / 1_000_000_000;
        currentTimeSec >= auctionStartTimeSec;
    };
    
    // Helper function to check if auction has ended
    public func hasAuctionEnded(auctionEndTime: Time.Time, currentTime: Time.Time) : Bool {
        let currentTimeSec = currentTime / 1_000_000_000;
        let auctionEndTimeSec = auctionEndTime / 1_000_000_000;
        currentTimeSec >= auctionEndTimeSec;
    };
};