// Fix BigInt serialization for Jest
BigInt.prototype.toJSON = function() {
  return this.toString();
};