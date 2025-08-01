import Nat "mo:base/Nat";
import Text "mo:base/Text";

actor Counter {
  stable var currentValue : Nat = 0;

  public func increment() : async Nat {
    currentValue += 1;
    currentValue
  };

  public func decrement() : async Nat {
    if (currentValue > 0) {
      currentValue -= 1;
    };
    currentValue
  };

  public query func getValue() : async Nat {
    currentValue
  };

  public func reset() : async () {
    currentValue := 0;
  };
}