import Time "mo:base/Time";
import Principal "mo:base/Principal";
import Nat "mo:base/Nat";
import Nat64 "mo:base/Nat64";
import Blob "mo:base/Blob";

module Types {
    // Order structure matching EVM Order struct
    public type Order = {
        salt: Nat;
        maker: Principal;
        receiver: Principal;
        makerAsset: Principal;
        takerAsset: Principal;
        makingAmount: Nat;
        takingAmount: Nat;
        deadline: Time.Time;
        nonce: Nat;
        srcChainId: Nat;
        dstChainId: Nat;
        auctionStartTime: Time.Time;
        auctionEndTime: Time.Time;
        startPrice: Nat;  // Starting price (higher) - scaled by 1e18
        endPrice: Nat;    // Ending price (lower) - scaled by 1e18
    };

    // Escrow state
    public type EscrowState = {
        #Active;
        #Withdrawn;
        #Cancelled;
    };

    // Escrow immutables
    public type Immutables = {
        orderHash: Blob;
        hashlock: Blob;
        maker: Principal;
        taker: Principal;
        token: Principal;
        amount: Nat;
        safetyDeposit: Nat;
        timelocks: Timelocks;
    };

    // Timelocks structure
    public type Timelocks = {
        deployedAt: Time.Time;
        srcWithdrawal: Nat64;
        srcCancellation: Nat64;
        srcPublicWithdrawal: Nat64;
        srcPublicCancellation: Nat64;
        dstWithdrawal: Nat64;
        dstCancellation: Nat64;
        dstPublicWithdrawal: Nat64;
    };

    // Resolver information for partial fills
    public type ResolverInfo = {
        resolver: Principal;
        partialAmount: Nat;
        safetyDeposit: Nat;
        withdrawn: Bool;
    };

    // Token types
    public type TokenType = {
        #Native;
        #ICRC1: Principal;
        #ICRC2: Principal;
    };

    // Transfer result
    public type TransferResult = {
        #Ok: Nat;
        #Err: TransferError;
    };

    public type TransferError = {
        #InsufficientBalance;
        #InsufficientAllowance;
        #Unauthorized;
        #TransferFailed;
        #Other: Text;
    };

    // ICRC1 token interface types
    public type ICRC1TransferArg = {
        from_subaccount: ?Blob;
        to: {
            owner: Principal;
            subaccount: ?Blob;
        };
        amount: Nat;
        fee: ?Nat;
        memo: ?Blob;
        created_at_time: ?Nat64;
    };

    public type ICRC1TransferError = {
        #BadFee: { expected_fee: Nat };
        #BadBurn: { min_burn_amount: Nat };
        #InsufficientFunds: { balance: Nat };
        #TooOld;
        #CreatedInFuture: { ledger_time: Nat64 };
        #Duplicate: { duplicate_of: Nat };
        #TemporarilyUnavailable;
        #GenericError: { error_code: Nat; message: Text };
    };

    // ICRC2 approve types
    public type ICRC2ApproveArgs = {
        from_subaccount: ?Blob;
        spender: {
            owner: Principal;
            subaccount: ?Blob;
        };
        amount: Nat;
        expected_allowance: ?Nat;
        expires_at: ?Nat64;
        fee: ?Nat;
        memo: ?Blob;
        created_at_time: ?Nat64;
    };

    public type ICRC2ApproveError = {
        #BadFee: { expected_fee: Nat };
        #InsufficientFunds: { balance: Nat };
        #AllowanceChanged: { current_allowance: Nat };
        #Expired: { ledger_time: Nat64 };
        #TooOld;
        #CreatedInFuture: { ledger_time: Nat64 };
        #Duplicate: { duplicate_of: Nat };
        #TemporarilyUnavailable;
        #GenericError: { error_code: Nat; message: Text };
    };

    // Result types
    public type Result<Ok, Err> = {
        #Ok: Ok;
        #Err: Err;
    };

    // Error types
    public type Error = {
        #InvalidOrder;
        #OrderExpired;
        #InvalidNonce;
        #InvalidAmount;
        #TransferFailed;
        #BadSignature;
        #InvalidSecret;
        #InvalidTime;
        #InvalidCaller;
        #AlreadyWithdrawn;
        #InvalidImmutables;
        #InsufficientSafetyDeposit;
        #EscrowAlreadyExists;
        #ResolverAlreadyExists;
        #NotInitialized;
        #AlreadyInitialized;
        #AuctionNotStarted;
        #AuctionEnded;
        #InvalidAuctionParameters;
        #OrderCompleted;
        #NativeTokenSendingFailure;
    };
}