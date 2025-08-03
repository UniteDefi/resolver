import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Int "mo:base/Int";
import Blob "mo:base/Blob";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Array "mo:base/Array";
import Buffer "mo:base/Buffer";
import Iter "mo:base/Iter";
import Cycles "mo:base/ExperimentalCycles";
import Types "./types";
import UniteOrderLib "./UniteOrderLib";

actor class UniteEscrow(init: {
    factory: Principal;
}) = self {
    
    // State variables
    private stable var state: Types.EscrowState = #Active;
    private stable var orderHash: ?Blob = null;
    private stable var hashlock: ?Blob = null;
    private stable var maker: ?Principal = null;
    private stable var taker: ?Principal = null;
    private stable var token: ?Principal = null;
    private stable var amount: ?Nat = null;
    private stable var safetyDeposit: ?Nat = null;
    private stable var timelocks: ?Types.Timelocks = null;
    private stable var isSource: ?Bool = null;
    private stable var srcCancellationTimestamp: ?Time.Time = null;
    private stable var factory: Principal = init.factory;
    
    // Partial filling support
    private var resolverPartialAmounts = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
    private var resolverSafetyDeposits = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
    private var resolverWithdrawn = HashMap.HashMap<Principal, Bool>(10, Principal.equal, Principal.hash);
    private stable var resolverEntries: [(Principal, (Nat, Nat, Bool))] = [];
    private stable var resolvers: [Principal] = [];
    private stable var totalPartialAmount: Nat = 0;
    private stable var totalPartialWithdrawn: Nat = 0;
    private stable var fundsDistributed: Bool = false;
    private stable var userFunded: Bool = false;
    
    // Constants
    private let CALLER_REWARD_PERCENTAGE: Nat = 10;
    
    // System functions for upgrades
    system func preupgrade() {
        // Save HashMap data to stable storage
        let entries = Buffer.Buffer<(Principal, (Nat, Nat, Bool))>(resolverPartialAmounts.size());
        for ((resolver, amount) in resolverPartialAmounts.entries()) {
            let deposit = switch (resolverSafetyDeposits.get(resolver)) {
                case (?d) { d };
                case null { 0 };
            };
            let withdrawn = switch (resolverWithdrawn.get(resolver)) {
                case (?w) { w };
                case null { false };
            };
            entries.add((resolver, (amount, deposit, withdrawn)));
        };
        resolverEntries := Buffer.toArray(entries);
    };
    
    system func postupgrade() {
        // Restore HashMap data from stable storage
        for ((resolver, (amount, deposit, withdrawn)) in resolverEntries.vals()) {
            resolverPartialAmounts.put(resolver, amount);
            resolverSafetyDeposits.put(resolver, deposit);
            resolverWithdrawn.put(resolver, withdrawn);
        };
        resolverEntries := [];
    };
    
    // Initialize for source escrow
    public shared(msg) func initialize(immutables: Types.Immutables, _isSource: Bool) : async Types.Result<(), Types.Error> {
        if (orderHash != null) {
            return #Err(#AlreadyInitialized);
        };
        
        if (msg.caller != factory) {
            return #Err(#InvalidCaller);
        };
        
        orderHash := ?immutables.orderHash;
        hashlock := ?immutables.hashlock;
        maker := ?immutables.maker;
        taker := ?immutables.taker;
        token := ?immutables.token;
        amount := ?immutables.amount;
        safetyDeposit := ?immutables.safetyDeposit;
        
        // Update deployed time to current time
        let updatedTimelocks: Types.Timelocks = {
            deployedAt = Time.now();
            srcWithdrawal = immutables.timelocks.srcWithdrawal;
            srcCancellation = immutables.timelocks.srcCancellation;
            srcPublicWithdrawal = immutables.timelocks.srcPublicWithdrawal;
            srcPublicCancellation = immutables.timelocks.srcPublicCancellation;
            dstWithdrawal = immutables.timelocks.dstWithdrawal;
            dstCancellation = immutables.timelocks.dstCancellation;
            dstPublicWithdrawal = immutables.timelocks.dstPublicWithdrawal;
        };
        
        timelocks := ?updatedTimelocks;
        isSource := ?_isSource;
        state := #Active;
        
        #Ok(());
    };
    
    // Initialize for destination escrow
    public shared(msg) func initializeDst(immutables: Types.Immutables, _srcCancellationTimestamp: Time.Time) : async Types.Result<(), Types.Error> {
        if (orderHash != null) {
            return #Err(#AlreadyInitialized);
        };
        
        if (msg.caller != factory) {
            return #Err(#InvalidCaller);
        };
        
        orderHash := ?immutables.orderHash;
        hashlock := ?immutables.hashlock;
        maker := ?immutables.maker;
        taker := ?immutables.taker;
        token := ?immutables.token;
        amount := ?immutables.amount;
        safetyDeposit := ?immutables.safetyDeposit;
        
        // Update deployed time to current time
        let updatedTimelocks: Types.Timelocks = {
            deployedAt = Time.now();
            srcWithdrawal = immutables.timelocks.srcWithdrawal;
            srcCancellation = immutables.timelocks.srcCancellation;
            srcPublicWithdrawal = immutables.timelocks.srcPublicWithdrawal;
            srcPublicCancellation = immutables.timelocks.srcPublicCancellation;
            dstWithdrawal = immutables.timelocks.dstWithdrawal;
            dstCancellation = immutables.timelocks.dstCancellation;
            dstPublicWithdrawal = immutables.timelocks.dstPublicWithdrawal;
        };
        
        timelocks := ?updatedTimelocks;
        isSource := ?false;
        srcCancellationTimestamp := ?_srcCancellationTimestamp;
        state := #Active;
        
        #Ok(());
    };
    
    // Handle the first resolver during initialization
    public shared(msg) func handleFirstResolver(resolver: Principal, partialAmount: Nat, resolverDeposit: Nat) : async Types.Result<(), Types.Error> {
        if (resolvers.size() > 0) {
            return #Err(#AlreadyInitialized);
        };
        
        switch (resolverPartialAmounts.get(resolver)) {
            case (?_) { return #Err(#ResolverAlreadyExists); };
            case null {};
        };
        
        if (partialAmount == 0) {
            return #Err(#InvalidAmount);
        };
        
        if (orderHash == null) {
            return #Err(#NotInitialized);
        };
        
        resolverPartialAmounts.put(resolver, partialAmount);
        resolverSafetyDeposits.put(resolver, resolverDeposit);
        
        let newResolvers = Buffer.fromArray<Principal>(resolvers);
        newResolvers.add(resolver);
        resolvers := Buffer.toArray(newResolvers);
        
        totalPartialAmount += partialAmount;
        
        #Ok(());
    };
    
    // Add subsequent resolvers
    public shared(msg) func addResolverSafetyDeposit(resolver: Principal, partialAmount: Nat) : async Types.Result<(), Types.Error> {
        if (orderHash == null) {
            return #Err(#NotInitialized);
        };
        
        switch (resolverPartialAmounts.get(resolver)) {
            case (?_) { return #Err(#ResolverAlreadyExists); };
            case null {};
        };
        
        if (partialAmount == 0) {
            return #Err(#InvalidAmount);
        };
        
        // Check cycles attached for safety deposit
        let deposit = Cycles.available();
        if (deposit == 0) {
            return #Err(#InsufficientSafetyDeposit);
        };
        
        // Accept the cycles
        let accepted = Cycles.accept<system>(deposit);
        
        resolverPartialAmounts.put(resolver, partialAmount);
        resolverSafetyDeposits.put(resolver, accepted);
        
        let newResolvers = Buffer.fromArray<Principal>(resolvers);
        newResolvers.add(resolver);
        resolvers := Buffer.toArray(newResolvers);
        
        totalPartialAmount += partialAmount;
        
        #Ok(());
    };
    
    // Withdraw with secret - anyone can call this
    public shared(msg) func withdrawWithSecret(secret: Blob, immutables: Types.Immutables) : async Types.Result<(), Types.Error> {
        switch (state) {
            case (#Active) {};
            case (_) { return #Err(#InvalidTime); };
        };
        
        // Verify secret
        switch (hashlock) {
            case (?hl) {
                if (not UniteOrderLib.verifySecret(secret, hl)) {
                    return #Err(#InvalidSecret);
                };
            };
            case null { return #Err(#NotInitialized); };
        };
        
        // Verify immutables match
        switch (_verifyImmutables(immutables)) {
            case (#Err(e)) { return #Err(e); };
            case (#Ok()) {};
        };
        
        if (fundsDistributed) {
            return #Err(#AlreadyWithdrawn);
        };
        
        // For destination chain, check that all resolvers have deposited
        switch (isSource) {
            case (?false) {
                // Check token balance for destination chain
                switch (token) {
                    case (?t) {
                        let balance = await _getTokenBalance(t);
                        if (balance < totalPartialAmount) {
                            return #Err(#InvalidTime); // Not all resolvers have deposited
                        };
                    };
                    case null { return #Err(#NotInitialized); };
                };
            };
            case _ {};
        };
        
        // Check if caller should get reward
        let currentTime = Time.now();
        let isAfterTimeLimit = _isAfterPublicWithdrawalTime(currentTime);
        let callerReward = _calculateCallerReward(msg.caller, isAfterTimeLimit);
        
        fundsDistributed := true;
        
        // Distribute funds based on whether this is source or destination
        switch (isSource) {
            case (?true) {
                await _distributeSourceFunds(callerReward);
            };
            case (?false) {
                await _distributeDestinationFunds(callerReward);
            };
            case null { return #Err(#NotInitialized); };
        };
        
        // Send caller reward if applicable
        if (callerReward > 0) {
            // Note: Cycle rewards not implemented in this version
        };
        
        state := #Withdrawn;
        
        #Ok(());
    };
    
    // Cancel escrow
    public shared(msg) func cancel(immutables: Types.Immutables) : async Types.Result<(), Types.Error> {
        switch (state) {
            case (#Active) {};
            case (_) { return #Err(#InvalidTime); };
        };
        
        // Verify immutables match
        switch (_verifyImmutables(immutables)) {
            case (#Err(e)) { return #Err(e); };
            case (#Ok()) {};
        };
        
        let currentTime = Time.now();
        
        switch (isSource, timelocks) {
            case (?true, ?tl) {
                // Source chain cancellation
                let cancellationTime = tl.deployedAt + Int.abs(Nat64.toNat(tl.srcCancellation) * 1_000_000_000);
                let publicCancellationTime = tl.deployedAt + Int.abs(Nat64.toNat(tl.srcPublicCancellation) * 1_000_000_000);
                
                if (currentTime < cancellationTime) {
                    return #Err(#InvalidTime);
                };
                
                if (currentTime < publicCancellationTime) {
                    switch (maker) {
                        case (?m) {
                            if (msg.caller != m) {
                                return #Err(#InvalidCaller);
                            };
                        };
                        case null { return #Err(#NotInitialized); };
                    };
                };
            };
            case (?false, ?tl) {
                // Destination chain cancellation
                switch (srcCancellationTimestamp) {
                    case (?srcCancel) {
                        if (currentTime < srcCancel) {
                            return #Err(#InvalidTime);
                        };
                    };
                    case null { return #Err(#NotInitialized); };
                };
                
                let cancellationTime = tl.deployedAt + Int.abs(Nat64.toNat(tl.dstCancellation) * 1_000_000_000);
                if (currentTime < cancellationTime) {
                    return #Err(#InvalidTime);
                };
            };
            case _ { return #Err(#NotInitialized); };
        };
        
        state := #Cancelled;
        
        // Return funds to maker and safety deposits to resolvers
        await _returnFundsOnCancel();
        
        #Ok(());
    };
    
    // Mark that user funds have been transferred to escrow
    public shared(msg) func markUserFunded() : async Types.Result<(), Types.Error> {
        if (msg.caller != factory) {
            return #Err(#InvalidCaller);
        };
        userFunded := true;
        #Ok(());
    };
    
    // View functions
    public query func getState() : async Types.EscrowState {
        state;
    };
    
    public query func getResolverCount() : async Nat {
        resolvers.size();
    };
    
    public query func getResolver(index: Nat) : async ?Principal {
        if (index < resolvers.size()) {
            ?resolvers[index];
        } else {
            null;
        };
    };
    
    public query func getResolverInfo(resolver: Principal) : async {
        partialAmount: Nat;
        safetyDeposit: Nat;
        withdrawn: Bool;
    } {
        let partialAmount = switch (resolverPartialAmounts.get(resolver)) {
            case (?a) { a };
            case null { 0 };
        };
        
        let safetyDeposit = switch (resolverSafetyDeposits.get(resolver)) {
            case (?d) { d };
            case null { 0 };
        };
        
        {
            partialAmount = partialAmount;
            safetyDeposit = safetyDeposit;
            withdrawn = fundsDistributed;
        };
    };
    
    public query func getTotalPartialAmount() : async Nat {
        totalPartialAmount;
    };
    
    public query func getImmutables() : async ?{
        orderHash: Blob;
        hashlock: Blob;
        maker: Principal;
        taker: Principal;
        token: Principal;
        amount: Nat;
        safetyDeposit: Nat;
        timelocks: Types.Timelocks;
    } {
        switch (orderHash, hashlock, maker, taker, token, amount, safetyDeposit, timelocks) {
            case (?oh, ?hl, ?m, ?t, ?tok, ?amt, ?sd, ?tl) {
                ?{
                    orderHash = oh;
                    hashlock = hl;
                    maker = m;
                    taker = t;
                    token = tok;
                    amount = amt;
                    safetyDeposit = sd;
                    timelocks = tl;
                };
            };
            case _ { null };
        };
    };
    
    // Private helper functions
    private func _verifyImmutables(immutables: Types.Immutables) : Types.Result<(), Types.Error> {
        switch (orderHash, hashlock, maker, taker, token, amount, safetyDeposit) {
            case (?oh, ?hl, ?m, ?t, ?tok, ?amt, ?sd) {
                if (immutables.orderHash != oh or
                    immutables.hashlock != hl or
                    immutables.maker != m or
                    immutables.taker != t or
                    immutables.token != tok or
                    immutables.amount != amt or
                    immutables.safetyDeposit != sd) {
                    return #Err(#InvalidImmutables);
                };
                #Ok(());
            };
            case _ { #Err(#NotInitialized) };
        };
    };
    
    private func _isAfterPublicWithdrawalTime(currentTime: Time.Time) : Bool {
        switch (isSource, timelocks) {
            case (?true, ?tl) {
                let publicWithdrawalTime = tl.deployedAt + Int.abs(Nat64.toNat(tl.srcPublicWithdrawal) * 1_000_000_000);
                currentTime >= publicWithdrawalTime;
            };
            case (?false, ?tl) {
                let publicWithdrawalTime = tl.deployedAt + Int.abs(Nat64.toNat(tl.dstPublicWithdrawal) * 1_000_000_000);
                currentTime >= publicWithdrawalTime;
            };
            case _ { false };
        };
    };
    
    private func _calculateCallerReward(caller: Principal, isAfterTimeLimit: Bool) : Nat {
        if (not isAfterTimeLimit) {
            return 0;
        };
        
        switch (maker) {
            case (?m) {
                if (caller == m) {
                    return 0;
                };
            };
            case null { return 0; };
        };
        
        // Check if caller is a resolver
        for (resolver in resolvers.vals()) {
            if (resolver == caller) {
                return 0;
            };
        };
        
        // Calculate total safety deposits
        var totalSafetyDeposits: Nat = 0;
        for (resolver in resolvers.vals()) {
            switch (resolverSafetyDeposits.get(resolver)) {
                case (?deposit) { totalSafetyDeposits += deposit; };
                case null {};
            };
        };
        
        (totalSafetyDeposits * CALLER_REWARD_PERCENTAGE) / 100;
    };
    
    private func _distributeSourceFunds(callerReward: Nat) : async () {
        for (resolver in resolvers.vals()) {
            let resolverAmount = switch (resolverPartialAmounts.get(resolver)) {
                case (?a) { a };
                case null { 0 };
            };
            
            let resolverDeposit = switch (resolverSafetyDeposits.get(resolver)) {
                case (?d) { d };
                case null { 0 };
            };
            
            // Calculate safety deposit after caller reward deduction
            var actualDeposit = resolverDeposit;
            if (callerReward > 0 and resolverDeposit > 0) {
                let deduction = (resolverDeposit * CALLER_REWARD_PERCENTAGE) / 100;
                actualDeposit := resolverDeposit - deduction;
            };
            
            // Transfer tokens to resolver
            switch (token) {
                case (?t) {
                    ignore await _transferToken(t, resolver, resolverAmount);
                };
                case null {};
            };
            
            // Return safety deposit
            if (actualDeposit > 0) {
                // Note: Cycle refund not implemented in this version
            };
        };
    };
    
    private func _distributeDestinationFunds(callerReward: Nat) : async () {
        // Send all tokens to maker
        switch (maker, token) {
            case (?m, ?t) {
                ignore await _transferToken(t, m, totalPartialAmount);
            };
            case _ {};
        };
        
        // Return safety deposits to resolvers
        for (resolver in resolvers.vals()) {
            let resolverDeposit = switch (resolverSafetyDeposits.get(resolver)) {
                case (?d) { d };
                case null { 0 };
            };
            
            // Calculate safety deposit after caller reward deduction
            var actualDeposit = resolverDeposit;
            if (callerReward > 0 and resolverDeposit > 0) {
                let deduction = (resolverDeposit * CALLER_REWARD_PERCENTAGE) / 100;
                actualDeposit := resolverDeposit - deduction;
            };
            
            if (actualDeposit > 0) {
                // Note: Cycle refund not implemented in this version
                // Note: Cycle refund not implemented in this version
            };
        };
    };
    
    private func _returnFundsOnCancel() : async () {
        // Return tokens to maker
        switch (maker, token) {
            case (?m, ?t) {
                let balance = await _getTokenBalance(t);
                if (balance > 0) {
                    ignore await _transferToken(t, m, balance);
                };
            };
            case _ {};
        };
        
        // Return safety deposits to resolvers
        for (resolver in resolvers.vals()) {
            let resolverDeposit = switch (resolverSafetyDeposits.get(resolver)) {
                case (?d) { d };
                case null { 0 };
            };
            
            if (resolverDeposit > 0) {
                // Note: Cycle refund not implemented in this version
                // Note: Cycle refund not implemented in this version
            };
        };
    };
    
    // Token interaction helpers
    private func _getTokenBalance(tokenPrincipal: Principal) : async Nat {
        let token = actor(Principal.toText(tokenPrincipal)) : actor {
            icrc1_balance_of: (account: { owner: Principal; subaccount: ?Blob }) -> async Nat;
        };
        
        await token.icrc1_balance_of({
            owner = Principal.fromActor(self);
            subaccount = null;
        });
    };
    
    private func _transferToken(tokenPrincipal: Principal, to: Principal, amount: Nat) : async Types.TransferResult {
        let token = actor(Principal.toText(tokenPrincipal)) : actor {
            icrc1_transfer: (Types.ICRC1TransferArg) -> async Result.Result<Nat, Types.ICRC1TransferError>;
        };
        
        let result = await token.icrc1_transfer({
            from_subaccount = null;
            to = {
                owner = to;
                subaccount = null;
            };
            amount = amount;
            fee = null;
            memo = null;
            created_at_time = null;
        });
        
        switch (result) {
            case (#ok(index)) { #Ok(index) };
            case (#err(e)) { #Err(#TransferFailed) };
        };
    };
    
    // Accept cycles for safety deposits
    public func notify() : async () {
        let amount = Cycles.available();
        if (amount > 0) {
            let accepted = Cycles.accept<system>(amount);
        };
    };
};