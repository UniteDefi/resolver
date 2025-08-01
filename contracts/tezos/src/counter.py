import smartpy as sp

class Counter(sp.Contract):
    def __init__(self, initial_value):
        self.init(
            value = initial_value
        )
    
    @sp.entry_point
    def increment(self, params):
        sp.verify(params.amount > 0, "Amount must be positive")
        self.data.value += params.amount
    
    @sp.entry_point
    def decrement(self, params):
        sp.verify(params.amount > 0, "Amount must be positive")
        sp.verify(self.data.value >= params.amount, "Cannot decrement below zero")
        self.data.value -= params.amount
    
    @sp.entry_point
    def get_value(self):
        sp.result(self.data.value)

# Tests
if "templates" not in __name__:
    @sp.add_test(name = "Counter Test")
    def test():
        # Create test scenario
        scenario = sp.test_scenario()
        
        # Deploy contract with initial value
        c1 = Counter(10)
        scenario += c1
        
        # Test increment
        scenario += c1.increment(amount = 5).run(valid = True)
        scenario.verify(c1.data.value == 15)
        
        # Test decrement
        scenario += c1.decrement(amount = 3).run(valid = True)
        scenario.verify(c1.data.value == 12)
        
        # Test invalid decrement (should fail)
        scenario += c1.decrement(amount = 20).run(valid = False)
        
        # Test get_value
        scenario += c1.get_value().run(valid = True)

# Compilation target
sp.add_compilation_target(
    "counter",
    Counter(
        initial_value = 0
    )
)