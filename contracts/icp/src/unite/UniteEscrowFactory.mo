import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Blob "mo:base/Blob";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Iter "mo:base/Iter";
import Cycles "mo:base/ExperimentalCycles";
import Types "./types";
import UniteOrderLib "./UniteOrderLib";
import UniteEscrow "./UniteEscrow";

actor class UniteEscrowFactory(init: { owner: Principal }) = self {
    
    // State variables
    private stable var owner: Principal = init.owner;
    
    // Storage for partial filling support
    private var srcEscrows = HashMap.HashMap<Blob, Principal>(10, Blob.equal, Blob.hash);
    private var dstEscrows = HashMap.HashMap<Blob, Principal>(10, Blob.equal, Blob.hash);
    private var isValidEscrow = HashMap.HashMap<Principal, Bool>(10, Principal.equal, Principal.hash);
    
    // Track resolver participation
    private var resolverPartialAmounts = HashMap.HashMap<Blob, HashMap.HashMap<Principal, Nat>>(10, Blob.equal, Blob.hash);
    private var resolverSafetyDeposits = HashMap.HashMap<Blob, HashMap.HashMap<Principal, Nat>>(10, Blob.equal, Blob.hash);
    private var totalFilledAmounts = HashMap.HashMap<Blob, Nat>(10, Blob.equal, Blob.hash);
    
    // Stable storage for upgrades
    private stable var srcEscrowEntries: [(Blob, Principal)] = [];
    private stable var dstEscrowEntries: [(Blob, Principal)] = [];
    private stable var validEscrowEntries: [(Principal, Bool)] = [];
    private stable var totalFilledEntries: [(Blob, Nat)] = [];
    
    // System functions for upgrades
    system func preupgrade() {
        srcEscrowEntries := Iter.toArray(srcEscrows.entries());
        dstEscrowEntries := Iter.toArray(dstEscrows.entries());
        validEscrowEntries := Iter.toArray(isValidEscrow.entries());
        totalFilledEntries := Iter.toArray(totalFilledAmounts.entries());
    };
    
    system func postupgrade() {
        for ((orderHash, escrow) in srcEscrowEntries.vals()) {
            srcEscrows.put(orderHash, escrow);
        };
        srcEscrowEntries := [];
        
        for ((orderHash, escrow) in dstEscrowEntries.vals()) {
            dstEscrows.put(orderHash, escrow);
        };
        dstEscrowEntries := [];
        
        for ((escrow, valid) in validEscrowEntries.vals()) {
            isValidEscrow.put(escrow, valid);
        };
        validEscrowEntries := [];
        
        for ((orderHash, amount) in totalFilledEntries.vals()) {
            totalFilledAmounts.put(orderHash, amount);
        };
        totalFilledEntries := [];
    };
    
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
    
    // Create source escrow with partial amount
    public shared(msg) func createSrcEscrowPartialFor(
        immutables: Types.Immutables,
        partialAmount: Nat,
        resolver: Principal
    ) : async Types.Result<Principal, Types.Error> {
        if (partialAmount == 0 or partialAmount > immutables.amount) {
            return #Err(#InvalidAmount);
        };
        
        // Check cycles for safety deposit
        let requiredSafetyDeposit = immutables.safetyDeposit;
        let availableCycles = Cycles.available();
        if (availableCycles < requiredSafetyDeposit) {
            return #Err(#InsufficientSafetyDeposit);
        };
        
        // Check if resolver already participated
        let resolverAmounts = switch (resolverPartialAmounts.get(immutables.orderHash)) {
            case (?map) { map };
            case null {
                let newMap = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
                resolverPartialAmounts.put(immutables.orderHash, newMap);
                newMap;
            };
        };
        
        switch (resolverAmounts.get(resolver)) {
            case (?_) { return #Err(#ResolverAlreadyExists); };
            case null {};
        };
        
        // Accept cycles for safety deposit
        let acceptedCycles = Cycles.accept<system>(requiredSafetyDeposit);
        
        // Check if escrow already exists
        let escrowPrincipal = switch (srcEscrows.get(immutables.orderHash)) {
            case (?existing) {
                // Escrow exists, add resolver to it
                let escrow = actor(Principal.toText(existing)) : actor {
                    addResolverSafetyDeposit: (Principal, Nat) -> async Types.Result<(), Types.Error>;
                };
                
                // Forward cycles to escrow
                switch (await (with cycles = acceptedCycles) escrow.addResolverSafetyDeposit(resolver, partialAmount)) {
                    case (#Ok()) {};
                    case (#Err(e)) { return #Err(e); };
                };
                
                existing;
            };
            case null {
                // First resolver - create new escrow
                // Add cycles for escrow creation
                // Create new escrow canister with cycles
                let escrow = await (with cycles = 1_000_000_000) UniteEscrow.UniteEscrow({ factory = Principal.fromActor(self) });
                let escrowPrincipal = Principal.fromActor(escrow);
                
                srcEscrows.put(immutables.orderHash, escrowPrincipal);
                isValidEscrow.put(escrowPrincipal, true);
                
                // Initialize the escrow
                switch (await (with cycles = acceptedCycles) escrow.initialize(immutables, true)) {
                    case (#Ok()) {};
                    case (#Err(e)) { return #Err(e); };
                };
                
                // Handle first resolver
                switch (await escrow.handleFirstResolver(resolver, partialAmount, acceptedCycles)) {
                    case (#Ok()) {};
                    case (#Err(e)) { return #Err(e); };
                };
                
                escrowPrincipal;
            };
        };
        
        // Track resolver participation
        resolverAmounts.put(resolver, partialAmount);
        
        let resolverDeposits = switch (resolverSafetyDeposits.get(immutables.orderHash)) {
            case (?map) { map };
            case null {
                let newMap = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
                resolverSafetyDeposits.put(immutables.orderHash, newMap);
                newMap;
            };
        };
        resolverDeposits.put(resolver, acceptedCycles);
        
        let currentTotal = switch (totalFilledAmounts.get(immutables.orderHash)) {
            case (?total) { total };
            case null { 0 };
        };
        totalFilledAmounts.put(immutables.orderHash, currentTotal + partialAmount);
        
        #Ok(escrowPrincipal);
    };
    
    // Create destination escrow with partial amount
    public shared(msg) func createDstEscrowPartialFor(
        immutables: Types.Immutables,
        srcCancellationTimestamp: Time.Time,
        partialAmount: Nat,
        resolver: Principal
    ) : async Types.Result<Principal, Types.Error> {
        if (partialAmount == 0) {
            return #Err(#InvalidAmount);
        };
        
        // Check cycles for safety deposit
        let requiredSafetyDeposit = immutables.safetyDeposit;
        let availableCycles = Cycles.available();
        if (availableCycles < requiredSafetyDeposit) {
            return #Err(#InsufficientSafetyDeposit);
        };
        
        // Check if resolver already participated
        let resolverAmounts = switch (resolverPartialAmounts.get(immutables.orderHash)) {
            case (?map) { map };
            case null {
                let newMap = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
                resolverPartialAmounts.put(immutables.orderHash, newMap);
                newMap;
            };
        };
        
        switch (resolverAmounts.get(resolver)) {
            case (?_) { return #Err(#ResolverAlreadyExists); };
            case null {};
        };
        
        // Accept cycles for safety deposit
        let acceptedCycles = Cycles.accept<system>(requiredSafetyDeposit);
        
        // Check if escrow already exists
        let escrowPrincipal = switch (dstEscrows.get(immutables.orderHash)) {
            case (?existing) {
                // Escrow exists, add resolver to it
                let escrow = actor(Principal.toText(existing)) : actor {
                    addResolverSafetyDeposit: (Principal, Nat) -> async Types.Result<(), Types.Error>;
                };
                
                // Forward cycles to escrow
                switch (await (with cycles = acceptedCycles) escrow.addResolverSafetyDeposit(resolver, partialAmount)) {
                    case (#Ok()) {};
                    case (#Err(e)) { return #Err(e); };
                };
                
                existing;
            };
            case null {
                // First resolver - create new escrow
                // Add cycles for escrow creation
                // Create new escrow canister with cycles
                let escrow = await (with cycles = 1_000_000_000) UniteEscrow.UniteEscrow({ factory = Principal.fromActor(self) });
                let escrowPrincipal = Principal.fromActor(escrow);
                
                dstEscrows.put(immutables.orderHash, escrowPrincipal);
                isValidEscrow.put(escrowPrincipal, true);
                
                // Initialize the escrow for destination
                switch (await (with cycles = acceptedCycles) escrow.initializeDst(immutables, srcCancellationTimestamp)) {
                    case (#Ok()) {};
                    case (#Err(e)) { return #Err(e); };
                };
                
                // Handle first resolver
                switch (await escrow.handleFirstResolver(resolver, partialAmount, acceptedCycles)) {
                    case (#Ok()) {};
                    case (#Err(e)) { return #Err(e); };
                };
                
                escrowPrincipal;
            };
        };
        
        // Track resolver participation
        resolverAmounts.put(resolver, partialAmount);
        
        let resolverDeposits = switch (resolverSafetyDeposits.get(immutables.orderHash)) {
            case (?map) { map };
            case null {
                let newMap = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
                resolverSafetyDeposits.put(immutables.orderHash, newMap);
                newMap;
            };
        };
        resolverDeposits.put(resolver, acceptedCycles);
        
        let currentTotal = switch (totalFilledAmounts.get(immutables.orderHash)) {
            case (?total) { total };
            case null { 0 };
        };
        totalFilledAmounts.put(immutables.orderHash, currentTotal + partialAmount);
        
        #Ok(escrowPrincipal);
    };
    
    // Transfer user funds to escrow after all resolvers commit
    public shared(msg) func transferUserFunds(
        orderHash: Blob,
        from: Principal,
        token: Principal,
        amount: Nat
    ) : async Types.Result<(), Types.Error> {
        if (msg.caller != owner) {
            return #Err(#InvalidCaller);
        };
        
        let escrow = switch (srcEscrows.get(orderHash)) {
            case (?e) { e };
            case null { return #Err(#InvalidOrder); };
        };
        
        let totalFilled = switch (totalFilledAmounts.get(orderHash)) {
            case (?t) { t };
            case null { 0 };
        };
        
        if (totalFilled < amount) {
            return #Err(#InvalidAmount);
        };
        
        // Transfer tokens from user to escrow using ICRC2 transferFrom
        let tokenActor = actor(Principal.toText(token)) : actor {
            icrc2_transfer_from: ({
                from: { owner: Principal; subaccount: ?Blob };
                to: { owner: Principal; subaccount: ?Blob };
                amount: Nat;
                fee: ?Nat;
                memo: ?Blob;
                created_at_time: ?Nat64;
            }) -> async Result.Result<Nat, Types.ICRC1TransferError>;
        };
        
        let result = await tokenActor.icrc2_transfer_from({
            from = { owner = from; subaccount = null };
            to = { owner = escrow; subaccount = null };
            amount = amount;
            fee = null;
            memo = null;
            created_at_time = null;
        });
        
        switch (result) {
            case (#ok(_)) {
                // Mark the escrow as funded
                let escrowActor = actor(Principal.toText(escrow)) : actor {
                    markUserFunded: () -> async Types.Result<(), Types.Error>;
                };
                
                switch (await escrowActor.markUserFunded()) {
                    case (#Ok()) { #Ok(()) };
                    case (#Err(e)) { #Err(e) };
                };
            };
            case (#err(_)) { #Err(#TransferFailed) };
        };
    };
    
    // View functions
    public query func getSrcEscrow(orderHash: Blob) : async ?Principal {
        srcEscrows.get(orderHash);
    };
    
    public query func getDstEscrow(orderHash: Blob) : async ?Principal {
        dstEscrows.get(orderHash);
    };
    
    public query func getResolverPartialAmount(orderHash: Blob, resolver: Principal) : async Nat {
        switch (resolverPartialAmounts.get(orderHash)) {
            case (?map) {
                switch (map.get(resolver)) {
                    case (?amount) { amount };
                    case null { 0 };
                };
            };
            case null { 0 };
        };
    };
    
    public query func getResolverSafetyDeposit(orderHash: Blob, resolver: Principal) : async Nat {
        switch (resolverSafetyDeposits.get(orderHash)) {
            case (?map) {
                switch (map.get(resolver)) {
                    case (?deposit) { deposit };
                    case null { 0 };
                };
            };
            case null { 0 };
        };
    };
    
    public query func getTotalFilledAmount(orderHash: Blob) : async Nat {
        switch (totalFilledAmounts.get(orderHash)) {
            case (?total) { total };
            case null { 0 };
        };
    };
    
    public query func isEscrowValid(escrow: Principal) : async Bool {
        switch (isValidEscrow.get(escrow)) {
            case (?valid) { valid };
            case null { false };
        };
    };
};