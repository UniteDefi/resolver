export class DutchAuctionLib {
  static getCurrentPrice(
    startPrice: string,
    endPrice: string,
    auctionStartTime: number,
    auctionEndTime: number,
    currentTime: number
  ): string {
    if (currentTime < auctionStartTime) {
      throw new Error("Auction not started");
    }
    
    if (currentTime >= auctionEndTime) {
      return endPrice;
    }
    
    const startPriceBig = BigInt(startPrice);
    const endPriceBig = BigInt(endPrice);
    
    if (auctionEndTime <= auctionStartTime || startPriceBig <= endPriceBig) {
      throw new Error("Invalid auction parameters");
    }
    
    const timeElapsed = BigInt(currentTime - auctionStartTime);
    const totalDuration = BigInt(auctionEndTime - auctionStartTime);
    const priceDecrease = startPriceBig - endPriceBig;
    
    // Linear price decay: currentPrice = startPrice - (priceDecrease * timeElapsed / totalDuration)
    const currentPrice = startPriceBig - (priceDecrease * timeElapsed / totalDuration);
    
    return currentPrice.toString();
  }

  static calculateTakingAmount(
    makingAmount: string,
    startPrice: string,
    endPrice: string,
    auctionStartTime: number,
    auctionEndTime: number,
    currentTime: number
  ): string {
    const currentPrice = this.getCurrentPrice(
      startPrice,
      endPrice,
      auctionStartTime,
      auctionEndTime,
      currentTime
    );
    
    const makingAmountBig = BigInt(makingAmount);
    const currentPriceBig = BigInt(currentPrice);
    
    // For XRPL, we need to handle drops (1 XRP = 1,000,000 drops)
    // Assuming prices are in 18 decimal format like EVM
    const PRICE_PRECISION = BigInt(10) ** BigInt(18);
    
    // takingAmount = makingAmount * currentPrice / PRICE_PRECISION
    const takingAmount = (makingAmountBig * currentPriceBig) / PRICE_PRECISION;
    
    return takingAmount.toString();
  }

  static calculateMakingAmount(
    takingAmount: string,
    startPrice: string,
    endPrice: string,
    auctionStartTime: number,
    auctionEndTime: number,
    currentTime: number
  ): string {
    const currentPrice = this.getCurrentPrice(
      startPrice,
      endPrice,
      auctionStartTime,
      auctionEndTime,
      currentTime
    );
    
    const takingAmountBig = BigInt(takingAmount);
    const currentPriceBig = BigInt(currentPrice);
    
    if (currentPriceBig === BigInt(0)) {
      throw new Error("Current price cannot be zero");
    }
    
    const PRICE_PRECISION = BigInt(10) ** BigInt(18);
    
    // makingAmount = takingAmount * PRICE_PRECISION / currentPrice
    const makingAmount = (takingAmountBig * PRICE_PRECISION) / currentPriceBig;
    
    return makingAmount.toString();
  }
}