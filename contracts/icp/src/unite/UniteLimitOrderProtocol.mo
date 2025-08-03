import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Blob "mo:base/Blob";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Types "./types";
import UniteOrderLib "./UniteOrderLib";
import DutchAuctionLib "./DutchAuctionLib";

actor class UniteLimitOrderProtocol() = self {
    
    // State variables
    private var invalidatedOrders = HashMap.HashMap<Blob, Bool>(10, Blob.equal, Blob.hash);
    private var nonces = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
    private var filledAmounts = HashMap.HashMap<Blob, Nat>(10, Blob.equal, Blob.hash);
    private var escrowAddresses = HashMap.HashMap<Blob, Principal>(10, Blob.equal, Blob.hash);
    
    // Stable storage for upgrades
    private stable var invalidatedOrderEntries: [(Blob, Bool)] = [];
    private stable var nonceEntries: [(Principal, Nat)] = [];
    private stable var filledAmountEntries: [(Blob, Nat)] = [];
    private stable var escrowAddressEntries: [(Blob, Principal)] = [];
    
    // System functions for upgrades
    system func preupgrade() {
        invalidatedOrderEntries := Iter.toArray(invalidatedOrders.entries());
        nonceEntries := Iter.toArray(nonces.entries());
        filledAmountEntries := Iter.toArray(filledAmounts.entries());
        escrowAddressEntries := Iter.toArray(escrowAddresses.entries());
    };
    
    system func postupgrade() {
        for ((orderHash, invalidated) in invalidatedOrderEntries.vals()) {
            invalidatedOrders.put(orderHash, invalidated);
        };
        invalidatedOrderEntries := [];
        
        for ((maker, nonce) in nonceEntries.vals()) {
            nonces.put(maker, nonce);
        };
        nonceEntries := [];
        
        for ((orderHash, amount) in filledAmountEntries.vals()) {
            filledAmounts.put(orderHash, amount);
        };
        filledAmountEntries := [];
        
        for ((orderHash, escrow) in escrowAddressEntries.vals()) {
            escrowAddresses.put(orderHash, escrow);
        };
        escrowAddressEntries := [];
    };
    
    // Fill order function
    public shared(msg) func fillOrder(
        order: Types.Order,
        signature: Blob,
        makingAmount: Nat,
        takingAmount: Nat,
        target: ?Principal
    ) : async Types.Result<{
        actualMakingAmount: Nat;
        actualTakingAmount: Nat;
        orderHash: Blob;
    }, Types.Error> {
        
        // Validate order
        let currentTime = Time.now();
        if (currentTime > order.deadline) {
            return #Err(#OrderExpired);
        };
        
        // Check nonce
        let makerNonce = switch (nonces.get(order.maker)) {
            case (?n) { n };
            case null { 0 };
        };
        
        if (order.nonce != makerNonce) {
            return #Err(#InvalidNonce);
        };
        
        // Calculate order hash
        let orderHash = UniteOrderLib.hashOrder(order);
        
        // Check if order is already invalidated
        switch (invalidatedOrders.get(orderHash)) {
            case (?true) { return #Err(#InvalidOrder); };
            case _ {};
        };
        
        // TODO: Verify signature (requires implementing signature verification)
        // For now, we'll skip signature verification as it requires complex cryptography
        
        // Check remaining available amount
        let alreadyFilled = switch (filledAmounts.get(orderHash)) {
            case (?amount) { amount };
            case null { 0 };
        };
        
        let remainingAmount = if (order.makingAmount > alreadyFilled) {
            order.makingAmount - alreadyFilled
        } else { 0 };
        
        if (remainingAmount == 0) {
            return #Err(#InvalidOrder); // Order already fully filled
        };
        
        // Calculate actual amounts based on Dutch auction pricing
        var actualMakingAmount: Nat = 0;
        var actualTakingAmount: Nat = 0;
        
        if (makingAmount == 0 and takingAmount == 0) {
            // For cross-chain swaps, use remaining amount
            actualMakingAmount := remainingAmount;
            
            // Calculate taking amount based on current Dutch auction price
            switch (DutchAuctionLib.calculateTakingAmount(
                actualMakingAmount,
                order.startPrice,
                order.endPrice,
                order.auctionStartTime,
                order.auctionEndTime,
                currentTime
            )) {
                case (#Ok(amount)) { actualTakingAmount := amount; };
                case (#Err(e)) { return #Err(e); };
            };
        } else if (makingAmount > 0) {
            actualMakingAmount := makingAmount;
            
            // Calculate taking amount based on current Dutch auction price
            switch (DutchAuctionLib.calculateTakingAmount(
                actualMakingAmount,
                order.startPrice,
                order.endPrice,
                order.auctionStartTime,
                order.auctionEndTime,
                currentTime
            )) {
                case (#Ok(amount)) { actualTakingAmount := amount; };
                case (#Err(e)) { return #Err(e); };
            };
        } else {
            // If taking amount is specified, calculate making amount based on current price
            switch (DutchAuctionLib.getCurrentPrice(
                order.startPrice,
                order.endPrice,
                order.auctionStartTime,
                order.auctionEndTime,
                currentTime
            )) {
                case (#Ok(currentPrice)) {
                    actualTakingAmount := takingAmount;
                    actualMakingAmount := (takingAmount * 1_000_000_000_000_000_000) / currentPrice;
                };
                case (#Err(e)) { return #Err(e); };
            };
        };
        
        // Validate amounts don't exceed remaining
        if (actualMakingAmount > remainingAmount) {
            return #Err(#InvalidAmount);
        };
        
        if (takingAmount > 0 and actualTakingAmount > order.takingAmount) {
            return #Err(#InvalidAmount);
        };
        
        // Update filled amounts
        filledAmounts.put(orderHash, alreadyFilled + actualMakingAmount);
        
        // Mark order as fully filled if completely consumed
        if (alreadyFilled + actualMakingAmount >= order.makingAmount) {
            invalidatedOrders.put(orderHash, true);
            nonces.put(order.maker, makerNonce + 1);
        };
        
        // Handle escrow address for consistent routing
        let recipient = switch (target) {
            case (?t) { t };
            case null { msg.caller };
        };
        
        // Store escrow address for first fill
        switch (escrowAddresses.get(orderHash)) {
            case null { escrowAddresses.put(orderHash, recipient); };
            case (?existing) {
                // For subsequent fills, ensure all funds go to the same escrow
                // This is handled by the resolver contract
            };
        };
        
        // For cross-chain orders, don't transfer tokens immediately
        // The tokens will be transferred later by the escrow factory
        let srcChainId = await getChainId();
        let isCrossChain = order.srcChainId != order.dstChainId or order.srcChainId != srcChainId;
        
        if (not isCrossChain) {
            // Regular same-chain order - transfer immediately
            // This would require token transfer implementation
            // For now, we'll leave this as a TODO
        };
        
        #Ok({
            actualMakingAmount = actualMakingAmount;
            actualTakingAmount = actualTakingAmount;
            orderHash = orderHash;
        });
    };
    
    // Update fill tracking for destination-side fills
    public shared(msg) func updateFillAmount(order: Types.Order, fillAmount: Nat) : async Types.Result<(), Types.Error> {
        let orderHash = UniteOrderLib.hashOrder(order);
        
        let currentFilled = switch (filledAmounts.get(orderHash)) {
            case (?amount) { amount };
            case null { 0 };
        };
        
        // Update filled amounts
        filledAmounts.put(orderHash, currentFilled + fillAmount);
        
        // Mark order as fully filled if completely consumed
        if (currentFilled + fillAmount >= order.makingAmount) {
            invalidatedOrders.put(orderHash, true);
            
            let currentNonce = switch (nonces.get(order.maker)) {
                case (?n) { n };
                case null { 0 };
            };
            nonces.put(order.maker, currentNonce + 1);
        };
        
        #Ok(());
    };
    
    // Cancel order
    public shared(msg) func cancelOrder(order: Types.Order) : async Types.Result<(), Types.Error> {
        if (msg.caller != order.maker) {
            return #Err(#InvalidOrder);
        };
        
        let orderHash = UniteOrderLib.hashOrder(order);
        
        switch (invalidatedOrders.get(orderHash)) {
            case (?true) { return #Err(#InvalidOrder); };
            case _ {};
        };
        
        invalidatedOrders.put(orderHash, true);
        
        #Ok(());
    };
    
    // View functions
    public query func hashOrder(order: Types.Order) : async Blob {
        UniteOrderLib.hashOrder(order);
    };
    
    public query func getFilledAmount(orderHash: Blob) : async Nat {
        switch (filledAmounts.get(orderHash)) {
            case (?amount) { amount };
            case null { 0 };
        };
    };
    
    public query func getRemainingAmount(order: Types.Order) : async Nat {
        let orderHash = UniteOrderLib.hashOrder(order);
        let filled = switch (filledAmounts.get(orderHash)) {
            case (?amount) { amount };
            case null { 0 };
        };
        
        if (order.makingAmount > filled) {
            order.makingAmount - filled
        } else { 0 };
    };
    
    public query func getEscrowAddress(orderHash: Blob) : async ?Principal {
        escrowAddresses.get(orderHash);
    };
    
    public query func isOrderFullyFilled(orderHash: Blob) : async Bool {
        switch (invalidatedOrders.get(orderHash)) {
            case (?invalidated) { invalidated };
            case null { false };
        };
    };
    
    public query func getNonce(maker: Principal) : async Nat {
        switch (nonces.get(maker)) {
            case (?nonce) { nonce };
            case null { 0 };
        };
    };
    
    // Helper function to get chain ID (ICP mainnet)
    private func getChainId() : async Nat {
        // ICP mainnet chain ID
        223; // Using 223 as ICP chain ID
    };
};