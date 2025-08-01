import smartpy as sp

class SimpleCounter(sp.Contract):
    def __init__(self, initial_value):
        self.init(value = initial_value)
    
    @sp.entry_point
    def increment(self, amount):
        self.data.value += amount
    
    @sp.entry_point
    def decrement(self, amount):
        sp.if self.data.value >= amount:
            self.data.value = sp.as_nat(self.data.value - amount)
        sp.else:
            self.data.value = 0

# Tests
if "templates" not in __name__:
    @sp.add_test(name = "SimpleCounter Test")
    def test():
        scenario = sp.test_scenario()
        
        # Deploy contract
        c1 = SimpleCounter(10)
        scenario += c1
        
        # Test increment
        scenario += c1.increment(5).run(valid = True)
        scenario.verify(c1.data.value == 15)
        
        # Test normal decrement
        scenario += c1.decrement(3).run(valid = True)
        scenario.verify(c1.data.value == 12)
        
        # Test decrement to zero
        scenario += c1.decrement(12).run(valid = True)
        scenario.verify(c1.data.value == 0)
        
        # Test increment from zero
        scenario += c1.increment(7).run(valid = True)
        scenario.verify(c1.data.value == 7)
        
        # Test decrement below zero (should clamp to 0)
        scenario += c1.decrement(20).run(valid = True)
        scenario.verify(c1.data.value == 0)

# Compilation target
sp.add_compilation_target("simple_counter", SimpleCounter(10))