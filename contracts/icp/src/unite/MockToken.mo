import Principal "mo:base/Principal";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import Nat64 "mo:base/Nat64";
import Int "mo:base/Int";
import Blob "mo:base/Blob";
import Result "mo:base/Result";
import HashMap "mo:base/HashMap";
import Time "mo:base/Time";
import Array "mo:base/Array";
import Iter "mo:base/Iter";

actor class MockToken(init: {
    name: Text;
    symbol: Text;
    decimals: Nat8;
    initialSupply: Nat;
    owner: Principal;
}) = self {
    
    // Token metadata
    private stable let name_: Text = init.name;
    private stable let symbol_: Text = init.symbol;
    private stable let decimals_: Nat8 = init.decimals;
    private stable var totalSupply_: Nat = init.initialSupply;
    private stable let owner_: Principal = init.owner;
    
    // Balances and allowances
    private var balances = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
    private var allowances = HashMap.HashMap<Principal, HashMap.HashMap<Principal, Nat>>(10, Principal.equal, Principal.hash);
    
    // Transaction log
    private stable var transactionLog: [{
        caller: Principal;
        from: Principal;
        to: Principal;
        amount: Nat;
        fee: Nat;
        timestamp: Time.Time;
        index: Nat;
    }] = [];
    private stable var nextTxIndex: Nat = 0;
    
    // Stable storage for upgrades
    private stable var balanceEntries: [(Principal, Nat)] = [];
    private stable var allowanceEntries: [(Principal, [(Principal, Nat)])] = [];
    
    // Initialize owner balance
    let _ = balances.put(init.owner, init.initialSupply);
    
    // System functions for upgrades
    system func preupgrade() {
        balanceEntries := Iter.toArray(balances.entries());
        
        let allowanceArray = Array.tabulate<(Principal, [(Principal, Nat)])>(
            allowances.size(),
            func (i: Nat): (Principal, [(Principal, Nat)]) {
                let entries = Iter.toArray(allowances.entries());
                let (owner, spenderMap) = entries[i];
                (owner, Iter.toArray(spenderMap.entries()));
            }
        );
        allowanceEntries := allowanceArray;
    };
    
    system func postupgrade() {
        for ((owner, balance) in balanceEntries.vals()) {
            balances.put(owner, balance);
        };
        balanceEntries := [];
        
        for ((owner, spenders) in allowanceEntries.vals()) {
            let spenderMap = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
            for ((spender, amount) in spenders.vals()) {
                spenderMap.put(spender, amount);
            };
            allowances.put(owner, spenderMap);
        };
        allowanceEntries := [];
    };
    
    // ICRC-1 Standard Methods
    
    public query func icrc1_name() : async Text {
        name_;
    };
    
    public query func icrc1_symbol() : async Text {
        symbol_;
    };
    
    public query func icrc1_decimals() : async Nat8 {
        decimals_;
    };
    
    public query func icrc1_fee() : async Nat {
        0; // No fee for mock token
    };
    
    public query func icrc1_total_supply() : async Nat {
        totalSupply_;
    };
    
    public query func icrc1_minting_account() : async ?{ owner: Principal; subaccount: ?Blob } {
        ?{ owner = owner_; subaccount = null };
    };
    
    public query func icrc1_balance_of(account: { owner: Principal; subaccount: ?Blob }) : async Nat {
        switch (balances.get(account.owner)) {
            case (?balance) { balance };
            case null { 0 };
        };
    };
    
    public query func icrc1_supported_standards() : async [{ name: Text; url: Text }] {
        [
            { name = "ICRC-1"; url = "https://github.com/dfinity/ICRC-1" },
            { name = "ICRC-2"; url = "https://github.com/dfinity/ICRC-1/tree/main/standards/ICRC-2" }
        ];
    };
    
    public shared(msg) func icrc1_transfer(args: {
        from_subaccount: ?Blob;
        to: { owner: Principal; subaccount: ?Blob };
        amount: Nat;
        fee: ?Nat;
        memo: ?Blob;
        created_at_time: ?Nat64;
    }) : async Result.Result<Nat, {
        #BadFee: { expected_fee: Nat };
        #BadBurn: { min_burn_amount: Nat };
        #InsufficientFunds: { balance: Nat };
        #TooOld;
        #CreatedInFuture: { ledger_time: Nat64 };
        #Duplicate: { duplicate_of: Nat };
        #TemporarilyUnavailable;
        #GenericError: { error_code: Nat; message: Text };
    }> {
        let from = msg.caller;
        let to = args.to.owner;
        let amount = args.amount;
        
        // Check balance
        let balance = switch (balances.get(from)) {
            case (?b) { b };
            case null { 0 };
        };
        
        if (balance < amount) {
            return #err(#InsufficientFunds { balance = balance });
        };
        
        // Update balances
        balances.put(from, balance - amount);
        
        let toBalance = switch (balances.get(to)) {
            case (?b) { b };
            case null { 0 };
        };
        balances.put(to, toBalance + amount);
        
        // Record transaction
        let txIndex = nextTxIndex;
        nextTxIndex += 1;
        
        let newTx = {
            caller = msg.caller;
            from = from;
            to = to;
            amount = amount;
            fee = 0;
            timestamp = Time.now();
            index = txIndex;
        };
        
        let newLog = Array.append(transactionLog, [newTx]);
        transactionLog := newLog;
        
        #ok(txIndex);
    };
    
    // ICRC-2 Standard Methods
    
    public query func icrc2_allowance(args: {
        account: { owner: Principal; subaccount: ?Blob };
        spender: { owner: Principal; subaccount: ?Blob };
    }) : async { allowance: Nat; expires_at: ?Nat64 } {
        let allowance = switch (allowances.get(args.account.owner)) {
            case (?ownerAllowances) {
                switch (ownerAllowances.get(args.spender.owner)) {
                    case (?amount) { amount };
                    case null { 0 };
                };
            };
            case null { 0 };
        };
        
        { allowance = allowance; expires_at = null };
    };
    
    public shared(msg) func icrc2_approve(args: {
        from_subaccount: ?Blob;
        spender: { owner: Principal; subaccount: ?Blob };
        amount: Nat;
        expected_allowance: ?Nat;
        expires_at: ?Nat64;
        fee: ?Nat;
        memo: ?Blob;
        created_at_time: ?Nat64;
    }) : async Result.Result<Nat, {
        #BadFee: { expected_fee: Nat };
        #InsufficientFunds: { balance: Nat };
        #AllowanceChanged: { current_allowance: Nat };
        #Expired: { ledger_time: Nat64 };
        #TooOld;
        #CreatedInFuture: { ledger_time: Nat64 };
        #Duplicate: { duplicate_of: Nat };
        #TemporarilyUnavailable;
        #GenericError: { error_code: Nat; message: Text };
    }> {
        let owner = msg.caller;
        let spender = args.spender.owner;
        let amount = args.amount;
        
        // Get or create owner's allowance map
        let ownerAllowances = switch (allowances.get(owner)) {
            case (?map) { map };
            case null {
                let newMap = HashMap.HashMap<Principal, Nat>(10, Principal.equal, Principal.hash);
                allowances.put(owner, newMap);
                newMap;
            };
        };
        
        // Check expected allowance if provided
        switch (args.expected_allowance) {
            case (?expected) {
                let current = switch (ownerAllowances.get(spender)) {
                    case (?c) { c };
                    case null { 0 };
                };
                if (current != expected) {
                    return #err(#AllowanceChanged { current_allowance = current });
                };
            };
            case null {};
        };
        
        // Set allowance
        ownerAllowances.put(spender, amount);
        
        // Record transaction
        let txIndex = nextTxIndex;
        nextTxIndex += 1;
        
        #ok(txIndex);
    };
    
    public shared(msg) func icrc2_transfer_from(args: {
        from: { owner: Principal; subaccount: ?Blob };
        to: { owner: Principal; subaccount: ?Blob };
        amount: Nat;
        fee: ?Nat;
        memo: ?Blob;
        created_at_time: ?Nat64;
    }) : async Result.Result<Nat, {
        #BadFee: { expected_fee: Nat };
        #BadBurn: { min_burn_amount: Nat };
        #InsufficientFunds: { balance: Nat };
        #InsufficientAllowance: { allowance: Nat };
        #TooOld;
        #CreatedInFuture: { ledger_time: Nat64 };
        #Duplicate: { duplicate_of: Nat };
        #TemporarilyUnavailable;
        #GenericError: { error_code: Nat; message: Text };
    }> {
        let spender = msg.caller;
        let from = args.from.owner;
        let to = args.to.owner;
        let amount = args.amount;
        
        // Check allowance
        let allowance = switch (allowances.get(from)) {
            case (?ownerAllowances) {
                switch (ownerAllowances.get(spender)) {
                    case (?a) { a };
                    case null { 0 };
                };
            };
            case null { 0 };
        };
        
        if (allowance < amount) {
            return #err(#InsufficientAllowance { allowance = allowance });
        };
        
        // Check balance
        let balance = switch (balances.get(from)) {
            case (?b) { b };
            case null { 0 };
        };
        
        if (balance < amount) {
            return #err(#InsufficientFunds { balance = balance });
        };
        
        // Update allowance
        switch (allowances.get(from)) {
            case (?ownerAllowances) {
                ownerAllowances.put(spender, allowance - amount);
            };
            case null {};
        };
        
        // Update balances
        balances.put(from, balance - amount);
        
        let toBalance = switch (balances.get(to)) {
            case (?b) { b };
            case null { 0 };
        };
        balances.put(to, toBalance + amount);
        
        // Record transaction
        let txIndex = nextTxIndex;
        nextTxIndex += 1;
        
        let newTx = {
            caller = msg.caller;
            from = from;
            to = to;
            amount = amount;
            fee = 0;
            timestamp = Time.now();
            index = txIndex;
        };
        
        let newLog = Array.append(transactionLog, [newTx]);
        transactionLog := newLog;
        
        #ok(txIndex);
    };
    
    // Additional helper methods for testing
    
    public shared(msg) func mint(to: Principal, amount: Nat) : async Result.Result<Nat, Text> {
        if (msg.caller != owner_) {
            return #err("Only owner can mint");
        };
        
        let currentBalance = switch (balances.get(to)) {
            case (?b) { b };
            case null { 0 };
        };
        
        balances.put(to, currentBalance + amount);
        totalSupply_ += amount;
        
        let txIndex = nextTxIndex;
        nextTxIndex += 1;
        
        #ok(txIndex);
    };
    
    public query func getTransactionHistory(start: Nat, length: Nat) : async [{
        caller: Principal;
        from: Principal;
        to: Principal;
        amount: Nat;
        fee: Nat;
        timestamp: Time.Time;
        index: Nat;
    }] {
        let end = Nat.min(start + length, transactionLog.size());
        if (start >= transactionLog.size()) {
            return [];
        };
        
        Array.tabulate<{
            caller: Principal;
            from: Principal;
            to: Principal;
            amount: Nat;
            fee: Nat;
            timestamp: Time.Time;
            index: Nat;
        }>(end - start, func (i: Nat) = transactionLog[start + i]);
    };
};