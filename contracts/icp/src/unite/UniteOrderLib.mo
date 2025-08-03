import Blob "mo:base/Blob";
import Nat "mo:base/Nat";
import Nat8 "mo:base/Nat8";
import Nat32 "mo:base/Nat32";
import Nat64 "mo:base/Nat64";
import Int "mo:base/Int";
import Principal "mo:base/Principal";
import Text "mo:base/Text";
import Buffer "mo:base/Buffer";
import Iter "mo:base/Iter";
import Array "mo:base/Array";
import Types "./types";

module UniteOrderLib {
    
    // Hash an order to get a unique identifier
    // Uses a simple deterministic hash for ICP
    public func hashOrder(order: Types.Order) : Blob {
        // Create a deterministic serialization of the order
        let orderData = Buffer.Buffer<Nat8>(256);
        
        // Add all order fields in a deterministic way
        addNatToBuffer(orderData, order.salt);
        addPrincipalToBuffer(orderData, order.maker);
        addPrincipalToBuffer(orderData, order.receiver);
        addPrincipalToBuffer(orderData, order.makerAsset);
        addPrincipalToBuffer(orderData, order.takerAsset);
        addNatToBuffer(orderData, order.makingAmount);
        addNatToBuffer(orderData, order.takingAmount);
        addTimeToBuffer(orderData, order.deadline);
        addNatToBuffer(orderData, order.nonce);
        addNatToBuffer(orderData, order.srcChainId);
        addNatToBuffer(orderData, order.dstChainId);
        addTimeToBuffer(orderData, order.auctionStartTime);
        addTimeToBuffer(orderData, order.auctionEndTime);
        addNatToBuffer(orderData, order.startPrice);
        addNatToBuffer(orderData, order.endPrice);
        
        // Use simple hash of the concatenated data
        let dataBlob = Blob.fromArray(Buffer.toArray(orderData));
        let hash = simpleHash(dataBlob);
        Blob.fromArray(hash);
    };
    
    // Hash immutables for escrow salt calculation
    public func hashImmutables(immutables: Types.Immutables) : Blob {
        let data = Buffer.Buffer<Nat8>(256);
        
        addBlobToBuffer(data, immutables.orderHash);
        addBlobToBuffer(data, immutables.hashlock);
        addPrincipalToBuffer(data, immutables.maker);
        addPrincipalToBuffer(data, immutables.taker);
        addPrincipalToBuffer(data, immutables.token);
        addNatToBuffer(data, immutables.amount);
        addNatToBuffer(data, immutables.safetyDeposit);
        
        // Add timelocks
        addTimeToBuffer(data, immutables.timelocks.deployedAt);
        addNat64ToBuffer(data, immutables.timelocks.srcWithdrawal);
        addNat64ToBuffer(data, immutables.timelocks.srcCancellation);
        addNat64ToBuffer(data, immutables.timelocks.srcPublicWithdrawal);
        addNat64ToBuffer(data, immutables.timelocks.srcPublicCancellation);
        addNat64ToBuffer(data, immutables.timelocks.dstWithdrawal);
        addNat64ToBuffer(data, immutables.timelocks.dstCancellation);
        addNat64ToBuffer(data, immutables.timelocks.dstPublicWithdrawal);
        
        let dataBlob = Blob.fromArray(Buffer.toArray(data));
        let hash = simpleHash(dataBlob);
        Blob.fromArray(hash);
    };
    
    // Verify secret against hashlock
    public func verifySecret(secret: Blob, hashlock: Blob) : Bool {
        let secretHash = simpleHash(secret);
        let hashlockBytes = Blob.toArray(hashlock);
        Array.equal(secretHash, hashlockBytes, Nat8.equal);
    };
    
    // Helper functions for serialization
    private func addNatToBuffer(buffer: Buffer.Buffer<Nat8>, n: Nat) {
        let bytes = natToBytes(n);
        for (byte in bytes.vals()) {
            buffer.add(byte);
        };
    };
    
    private func addPrincipalToBuffer(buffer: Buffer.Buffer<Nat8>, p: Principal) {
        let bytes = Blob.toArray(Principal.toBlob(p));
        for (byte in bytes.vals()) {
            buffer.add(byte);
        };
    };
    
    private func addTimeToBuffer(buffer: Buffer.Buffer<Nat8>, t: Int) {
        // Convert time to Nat for serialization
        let n = Int.abs(t);
        addNatToBuffer(buffer, n);
    };
    
    private func addNat64ToBuffer(buffer: Buffer.Buffer<Nat8>, n: Nat64) {
        addNatToBuffer(buffer, Nat64.toNat(n));
    };
    
    private func addBlobToBuffer(buffer: Buffer.Buffer<Nat8>, blob: Blob) {
        let bytes = Blob.toArray(blob);
        for (byte in bytes.vals()) {
            buffer.add(byte);
        };
    };
    
    // Simple hash function using FNV-1a algorithm
    private func simpleHash(data: Blob) : [Nat8] {
        let bytes = Blob.toArray(data);
        var hash: Nat32 = 2166136261; // FNV offset basis
        
        for (byte in bytes.vals()) {
            hash := hash ^ Nat32.fromNat(Nat8.toNat(byte));
            hash := hash *% 16777619; // FNV prime
        };
        
        // Convert to 32-byte hash (pad with zeros)
        let result = Array.init<Nat8>(32, 0);
        result[0] := Nat8.fromNat((Nat32.toNat(hash) / 16777216) % 256);
        result[1] := Nat8.fromNat((Nat32.toNat(hash) / 65536) % 256);
        result[2] := Nat8.fromNat((Nat32.toNat(hash) / 256) % 256);
        result[3] := Nat8.fromNat(Nat32.toNat(hash) % 256);
        
        Array.freeze(result);
    };
    
    // Convert Nat to bytes (big-endian)
    private func natToBytes(n: Nat) : [Nat8] {
        if (n == 0) {
            return [0];
        };
        
        let bytes = Buffer.Buffer<Nat8>(8);
        var temp = n;
        
        while (temp > 0) {
            bytes.add(Nat8.fromNat(temp % 256));
            temp := temp / 256;
        };
        
        // Reverse for big-endian
        let result = Buffer.toArray(bytes);
        Array.reverse(result);
    };
};