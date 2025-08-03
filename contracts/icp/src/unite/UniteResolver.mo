import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Blob "mo:base/Blob";
import Array "mo:base/Array";
import Result "mo:base/Result";
import Cycles "mo:base/ExperimentalCycles";
import Types "./types";
import UniteOrderLib "./UniteOrderLib";
import DutchAuctionLib "./DutchAuctionLib";

actor class UniteResolver(init: {
    factory: Principal;
    limitOrderProtocol: Principal;
    owner: Principal;
}) = self {
    
    // State variables
    private stable var factory: Principal = init.factory;
    private stable var limitOrderProtocol: Principal = init.limitOrderProtocol;
    private stable var owner: Principal = init.owner;
    
    // Owner management
    public shared(msg) func setOwner(newOwner: Principal) : async Types.Result<(), Types.Error> {
        if (msg.caller != owner) {
            return #Err(#InvalidCaller);
        };
        owner := newOwner;
        #Ok(());
    };
    
    public query func getOwner() : async Principal {
        owner;
    };
    
    // Deploy source escrow with partial amount
    public shared(msg) func deploySrcCompactPartial(
        immutables: Types.Immutables,
        order: Types.Order,
        r: Blob,
        vs: Blob,
        amount: Nat,
        partialAmount: Nat
    ) : async Types.Result<Principal, Types.Error> {
        // Check if this is the first fill for this order
        let orderHash = UniteOrderLib.hashOrder(order);
        
        let lop = actor(Principal.toText(limitOrderProtocol)) : actor {
            getEscrowAddress: (Blob) -> async ?Principal;
            fillOrder: (Types.Order, Blob, Nat, Nat, ?Principal) -> async Types.Result<{
                actualMakingAmount: Nat;
                actualTakingAmount: Nat;
                orderHash: Blob;
            }, Types.Error>;
        };
        
        let existingEscrowAddress = await lop.getEscrowAddress(orderHash);
        
        var escrowAddress: Principal = Principal.fromText("aaaaa-aa");
        
        let factoryActor = actor(Principal.toText(factory)) : actor {
            createSrcEscrowPartialFor: (Types.Immutables, Nat, Principal) -> async Types.Result<Principal, Types.Error>;
        };
        
        switch (existingEscrowAddress) {
            case null {
                // First resolver - create escrow
                let cycles = Cycles.available();
                
                switch (await (with cycles = cycles) factoryActor.createSrcEscrowPartialFor(immutables, partialAmount, msg.caller)) {
                    case (#Ok(escrow)) {
                        escrowAddress := escrow;
                    };
                    case (#Err(e)) { return #Err(e); };
                };
            };
            case (?existing) {
                // Subsequent resolvers - use existing escrow
                escrowAddress := existing;
                
                let cycles = Cycles.available();
                
                switch (await (with cycles = cycles) factoryActor.createSrcEscrowPartialFor(immutables, partialAmount, msg.caller)) {
                    case (#Ok(returnedAddress)) {
                        if (returnedAddress != escrowAddress) {
                            return #Err(#InvalidOrder);
                        };
                    };
                    case (#Err(e)) { return #Err(e); };
                };
            };
        };
        
        // Fill the order with partial amount
        // Combine r and vs to create signature (simplified - real implementation would need proper signature handling)
        let rArray = Blob.toArray(r);
        let vsArray = Blob.toArray(vs);
        let combinedArray = Array.append(rArray, vsArray);
        let signature = Blob.fromArray(combinedArray);
        
        switch (await lop.fillOrder(order, signature, partialAmount, 0, ?escrowAddress)) {
            case (#Ok(result)) {
                #Ok(escrowAddress);
            };
            case (#Err(e)) { return #Err(e); };
        };
    };
    
    // Deploy destination escrow with partial amount
    public shared(msg) func deployDstPartial(
        immutables: Types.Immutables,
        srcCancellationTimestamp: Time.Time,
        partialAmount: Nat
    ) : async Types.Result<Principal, Types.Error> {
        let factoryActor = actor(Principal.toText(factory)) : actor {
            createDstEscrowPartialFor: (Types.Immutables, Time.Time, Nat, Principal) -> async Types.Result<Principal, Types.Error>;
        };
        
        // Forward cycles for safety deposit
        let cycles = Cycles.available();
        
        let escrowResult = await (with cycles = cycles) factoryActor.createDstEscrowPartialFor(
            immutables,
            srcCancellationTimestamp,
            partialAmount,
            msg.caller
        );
        
        switch (escrowResult) {
            case (#Ok(escrowAddress)) {
                // Transfer destination tokens to escrow
                let token = immutables.token;
                
                let tokenActor = actor(Principal.toText(token)) : actor {
                    icrc1_transfer: (Types.ICRC1TransferArg) -> async Result.Result<Nat, Types.ICRC1TransferError>;
                };
                
                let transferResult = await tokenActor.icrc1_transfer({
                    from_subaccount = null;
                    to = {
                        owner = escrowAddress;
                        subaccount = null;
                    };
                    amount = partialAmount;
                    fee = null;
                    memo = null;
                    created_at_time = null;
                });
                
                switch (transferResult) {
                    case (#ok(_)) { #Ok(escrowAddress) };
                    case (#err(_)) { #Err(#TransferFailed) };
                };
            };
            case (#Err(e)) { #Err(e) };
        };
    };
    
    // Fill order with Dutch auction pricing
    public shared(msg) func fillOrder(
        immutables: Types.Immutables,
        order: Types.Order,
        srcCancellationTimestamp: Time.Time,
        srcAmount: Nat
    ) : async Types.Result<{
        escrowAddress: Principal;
        srcAmount: Nat;
        destAmount: Nat;
        currentPrice: Nat;
    }, Types.Error> {
        
        if (srcAmount == 0) {
            return #Err(#InvalidAmount);
        };
        
        let orderHash = UniteOrderLib.hashOrder(order);
        
        let lop = actor(Principal.toText(limitOrderProtocol)) : actor {
            isOrderFullyFilled: (Blob) -> async Bool;
            getRemainingAmount: (Types.Order) -> async Nat;
            updateFillAmount: (Types.Order, Nat) -> async Types.Result<(), Types.Error>;
        };
        
        // Check if order is already completed
        let isFullyFilled = await lop.isOrderFullyFilled(orderHash);
        if (isFullyFilled) {
            return #Err(#OrderCompleted);
        };
        
        // Check remaining amount
        let remainingAmount = await lop.getRemainingAmount(order);
        if (srcAmount > remainingAmount) {
            return #Err(#InvalidAmount);
        };
        
        let currentTime = Time.now();
        
        // Calculate destination amount based on current Dutch auction price
        let destAmountResult = DutchAuctionLib.calculateTakingAmount(
            srcAmount,
            order.startPrice,
            order.endPrice,
            order.auctionStartTime,
            order.auctionEndTime,
            currentTime
        );
        
        let destAmount = switch (destAmountResult) {
            case (#Ok(amount)) { amount };
            case (#Err(e)) { return #Err(e); };
        };
        
        // Get current price for return value
        let currentPriceResult = DutchAuctionLib.getCurrentPrice(
            order.startPrice,
            order.endPrice,
            order.auctionStartTime,
            order.auctionEndTime,
            currentTime
        );
        
        let currentPrice = switch (currentPriceResult) {
            case (#Ok(price)) { price };
            case (#Err(e)) { return #Err(e); };
        };
        
        // Deploy destination escrow with safety deposit
        let factoryActor = actor(Principal.toText(factory)) : actor {
            createDstEscrowPartialFor: (Types.Immutables, Time.Time, Nat, Principal) -> async Types.Result<Principal, Types.Error>;
        };
        
        // Forward cycles for safety deposit
        let cycles = Cycles.available();
        
        let escrowResult = await (with cycles = cycles) factoryActor.createDstEscrowPartialFor(
            immutables,
            srcCancellationTimestamp,
            destAmount,
            msg.caller
        );
        
        switch (escrowResult) {
            case (#Ok(escrowAddress)) {
                // Transfer destination tokens from resolver to escrow
                let token = immutables.token;
                
                let tokenActor = actor(Principal.toText(token)) : actor {
                    icrc1_transfer: (Types.ICRC1TransferArg) -> async Result.Result<Nat, Types.ICRC1TransferError>;
                };
                
                let transferResult = await tokenActor.icrc1_transfer({
                    from_subaccount = null;
                    to = {
                        owner = escrowAddress;
                        subaccount = null;
                    };
                    amount = destAmount;
                    fee = null;
                    memo = null;
                    created_at_time = null;
                });
                
                switch (transferResult) {
                    case (#ok(_)) {
                        // Update fill tracking in LimitOrderProtocol
                        switch (await lop.updateFillAmount(order, srcAmount)) {
                            case (#Ok()) {
                                #Ok({
                                    escrowAddress = escrowAddress;
                                    srcAmount = srcAmount;
                                    destAmount = destAmount;
                                    currentPrice = currentPrice;
                                });
                            };
                            case (#Err(e)) { #Err(e) };
                        };
                    };
                    case (#err(_)) { #Err(#TransferFailed) };
                };
            };
            case (#Err(e)) { #Err(e) };
        };
    };
    
    // Withdraw from escrow
    public shared(msg) func withdraw(
        escrow: Principal,
        secret: Blob,
        immutables: Types.Immutables
    ) : async Types.Result<(), Types.Error> {
        let escrowActor = actor(Principal.toText(escrow)) : actor {
            withdrawWithSecret: (Blob, Types.Immutables) -> async Types.Result<(), Types.Error>;
        };
        
        await escrowActor.withdrawWithSecret(secret, immutables);
    };
    
    // Cancel escrow
    public shared(msg) func cancel(
        escrow: Principal,
        immutables: Types.Immutables
    ) : async Types.Result<(), Types.Error> {
        let escrowActor = actor(Principal.toText(escrow)) : actor {
            cancel: (Types.Immutables) -> async Types.Result<(), Types.Error>;
        };
        
        await escrowActor.cancel(immutables);
    };
    
    // Pre-approve tokens for Dutch auction orders
    public shared(msg) func approveToken(token: Principal, amount: Nat) : async Types.Result<Nat, Types.Error> {
        if (msg.caller != owner) {
            return #Err(#InvalidCaller);
        };
        
        let tokenActor = actor(Principal.toText(token)) : actor {
            icrc2_approve: (Types.ICRC2ApproveArgs) -> async Result.Result<Nat, Types.ICRC2ApproveError>;
        };
        
        let result = await tokenActor.icrc2_approve({
            from_subaccount = null;
            spender = {
                owner = Principal.fromActor(self);
                subaccount = null;
            };
            amount = amount;
            expected_allowance = null;
            expires_at = null;
            fee = null;
            memo = null;
            created_at_time = null;
        });
        
        switch (result) {
            case (#ok(index)) { #Ok(index) };
            case (#err(_)) { #Err(#TransferFailed) };
        };
    };
    
    // Accept cycles
    public func notify() : async () {
        let amount = Cycles.available();
        if (amount > 0) {
            let accepted = Cycles.accept<system>(amount);
        };
    };
};