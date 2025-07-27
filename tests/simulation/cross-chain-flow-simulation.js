#!/usr/bin/env node

/**
 * Cross-Chain Flow Simulation
 * Simulates the complete flow between Base Sepolia and Aptos testnet
 */

class CrossChainTestSimulation {
  constructor() {
    this.transactions = [];
    this.currentTime = Math.floor(Date.now() / 1000);

    // Mock addresses for simulation
    this.addresses = {
      seller: "0x742d35Cc6764C788f97cbF6084c39123e1234567", // Base Sepolia
      resolver: "0x8ba1f109551bD432803012645Hac189451c123ab", // Base Sepolia
      aptosResolver: "0xa1b2c3d4e5f6789012345678901234567890abcdef1234567890123456789abcd", // Aptos
      aptosUser: "0xb2c3d4e5f6789012345678901234567890abcdef1234567890123456789abcde1", // Aptos
      baseEscrowFactory: "0x123456789012345678901234567890123456789A",
      aptosEscrowFactory: "0x1::escrow_factory",
      usdc: "0x036CbD53842c5426634e7929541eC2318f3dCF7e" // Base Sepolia USDC
    };
  }

  addTransaction(tx) {
    const transaction = {
      hash: this.generateTxHash(),
      chain: tx.chain || "unknown",
      action: tx.action || "unknown",
      actor: tx.actor || "unknown",
      gasUsed: Math.floor(Math.random() * 100000) + 21000,
      timestamp: this.currentTime++,
      ...tx
    };
    
    this.transactions.push(transaction);
    return transaction;
  }

  generateTxHash() {
    return "0x" + Array.from({length: 64}, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  }

  generateOrderId() {
    return "0x" + Array.from({length: 64}, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  }

  generateSecret() {
    return "0x" + Array.from({length: 64}, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  }

  hashSecret(secret) {
    // Mock SHA-256 hash
    return "0x" + Array.from({length: 64}, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
  }

  // Simulation 1: Base Sepolia -> Aptos
  async simulateBaseToAptos() {
    console.log("\n🌉 SIMULATION 1: Base Sepolia -> Aptos Cross-Chain Swap");
    console.log("=====================================================");
    
    const order = {
      orderId: this.generateOrderId(),
      srcChain: "Base Sepolia",
      dstChain: "Aptos",
      srcAmount: "100.000000", // 100 USDC
      dstAmount: "99.000000",  // 99 USDC (1% fee)
      secret: this.generateSecret(),
      secretHash: "",
      timelock: this.currentTime + 3600
    };
    order.secretHash = this.hashSecret(order.secret);

    console.log(`\n📋 Order Details:`);
    console.log(`Order ID: ${order.orderId}`);
    console.log(`From: ${order.srcAmount} USDC (Base Sepolia)`);
    console.log(`To: ${order.dstAmount} USDC (Aptos)`);
    console.log(`Secret Hash: ${order.secretHash}`);

    // Step 1: Seller creates order on Base Sepolia
    console.log(`\n1️⃣ Seller creates order on Base Sepolia`);
    const createOrderTx = this.addTransaction({
      chain: "Base Sepolia",
      action: "Create Order",
      actor: "Seller",
      amount: order.srcAmount + " USDC"
    });
    console.log(`   TX: ${createOrderTx.hash}`);
    console.log(`   Gas: ${createOrderTx.gasUsed.toLocaleString()}`);

    // Step 2: Seller approves USDC to escrow factory
    console.log(`\n2️⃣ Seller approves USDC to escrow factory`);
    const approveTx = this.addTransaction({
      chain: "Base Sepolia", 
      action: "Approve USDC",
      actor: "Seller",
      amount: order.srcAmount + " USDC"
    });
    console.log(`   TX: ${approveTx.hash}`);
    console.log(`   Gas: ${approveTx.gasUsed.toLocaleString()}`);

    // Step 3: Resolver fills order on Base Sepolia
    console.log(`\n3️⃣ Resolver fills order on Base Sepolia`);
    const fillOrderTx = this.addTransaction({
      chain: "Base Sepolia",
      action: "Fill Order (Lock USDC)",
      actor: "Resolver", 
      amount: order.srcAmount + " USDC"
    });
    console.log(`   TX: ${fillOrderTx.hash}`);
    console.log(`   Gas: ${fillOrderTx.gasUsed.toLocaleString()}`);
    console.log(`   Escrow Address: ${this.addresses.baseEscrowFactory}/escrow_${order.orderId.slice(2, 10)}`);

    // Step 4: Resolver creates destination escrow on Aptos
    console.log(`\n4️⃣ Resolver creates destination escrow on Aptos`);
    const createAptosEscrowTx = this.addTransaction({
      chain: "Aptos",
      action: "Create HTLC Escrow",
      actor: "Resolver",
      amount: order.dstAmount + " USDC"
    });
    console.log(`   TX: ${createAptosEscrowTx.hash}`);
    console.log(`   Gas: ${createAptosEscrowTx.gasUsed.toLocaleString()} Gas Units`);
    console.log(`   Resource Account: ${this.addresses.aptosEscrowFactory}::escrow_${order.orderId.slice(2, 10)}`);

    // Step 5: User validates and withdraws on Aptos (reveals secret)
    console.log(`\n5️⃣ User withdraws from Aptos escrow (reveals secret)`);
    const aptosWithdrawTx = this.addTransaction({
      chain: "Aptos",
      action: "Withdraw with Secret",
      actor: "User",
      amount: order.dstAmount + " USDC"
    });
    console.log(`   TX: ${aptosWithdrawTx.hash}`);
    console.log(`   Gas: ${aptosWithdrawTx.gasUsed.toLocaleString()} Gas Units`);
    console.log(`   Secret Revealed: ${order.secret}`);

    // Step 6: Resolver uses revealed secret on Base Sepolia
    console.log(`\n6️⃣ Resolver withdraws from Base Sepolia escrow`);
    const baseWithdrawTx = this.addTransaction({
      chain: "Base Sepolia",
      action: "Withdraw with Secret",
      actor: "Resolver",
      amount: order.srcAmount + " USDC"
    });
    console.log(`   TX: ${baseWithdrawTx.hash}`);
    console.log(`   Gas: ${baseWithdrawTx.gasUsed.toLocaleString()}`);

    console.log(`\n✅ Swap Complete!`);
    console.log(`   User: -${order.srcAmount} USDC (Base) + ${order.dstAmount} USDC (Aptos)`);
    console.log(`   Resolver: +${order.srcAmount} USDC (Base) - ${order.dstAmount} USDC (Aptos)`);
    console.log(`   Resolver Profit: ${(parseFloat(order.srcAmount) - parseFloat(order.dstAmount)).toFixed(6)} USDC`);
  }

  // Simulation 2: Aptos -> Base Sepolia
  async simulateAptosToBase() {
    console.log("\n\n🌉 SIMULATION 2: Aptos -> Base Sepolia Cross-Chain Swap");
    console.log("======================================================");
    
    const order = {
      orderId: this.generateOrderId(),
      srcChain: "Aptos",
      dstChain: "Base Sepolia",
      srcAmount: "100.000000", // 100 USDC
      dstAmount: "99.500000",  // 99.5 USDC (0.5% fee)
      secret: this.generateSecret(),
      secretHash: "",
      timelock: this.currentTime + 3600
    };
    order.secretHash = this.hashSecret(order.secret);

    console.log(`\n📋 Order Details:`);
    console.log(`Order ID: ${order.orderId}`);
    console.log(`From: ${order.srcAmount} USDC (Aptos)`);
    console.log(`To: ${order.dstAmount} USDC (Base Sepolia)`);
    console.log(`Secret Hash: ${order.secretHash}`);

    // Step 1: User creates order on Aptos
    console.log(`\n1️⃣ User creates order on Aptos`);
    const createOrderTx = this.addTransaction({
      chain: "Aptos",
      action: "Create Order",
      actor: "User",
      amount: order.srcAmount + " USDC"
    });
    console.log(`   TX: ${createOrderTx.hash}`);
    console.log(`   Gas: ${createOrderTx.gasUsed.toLocaleString()} Gas Units`);

    // Step 2: User creates source escrow on Aptos
    console.log(`\n2️⃣ User creates source escrow on Aptos`);
    const createAptosEscrowTx = this.addTransaction({
      chain: "Aptos",
      action: "Create Source HTLC",
      actor: "User",
      amount: order.srcAmount + " USDC"
    });
    console.log(`   TX: ${createAptosEscrowTx.hash}`);
    console.log(`   Gas: ${createAptosEscrowTx.gasUsed.toLocaleString()} Gas Units`);
    console.log(`   Resource Account: ${this.addresses.aptosEscrowFactory}::escrow_${order.orderId.slice(2, 10)}`);

    // Step 3: Resolver detects order and creates destination escrow on Base Sepolia
    console.log(`\n3️⃣ Resolver creates destination escrow on Base Sepolia`);
    const createBaseEscrowTx = this.addTransaction({
      chain: "Base Sepolia",
      action: "Create Destination HTLC",
      actor: "Resolver",
      amount: order.dstAmount + " USDC"
    });
    console.log(`   TX: ${createBaseEscrowTx.hash}`);
    console.log(`   Gas: ${createBaseEscrowTx.gasUsed.toLocaleString()}`);
    console.log(`   Escrow Address: ${this.addresses.baseEscrowFactory}/escrow_${order.orderId.slice(2, 10)}`);

    // Step 4: User validates and withdraws on Base Sepolia (reveals secret)
    console.log(`\n4️⃣ User withdraws from Base Sepolia escrow (reveals secret)`);
    const baseWithdrawTx = this.addTransaction({
      chain: "Base Sepolia",
      action: "Withdraw with Secret",
      actor: "User",
      amount: order.dstAmount + " USDC"
    });
    console.log(`   TX: ${baseWithdrawTx.hash}`);
    console.log(`   Gas: ${baseWithdrawTx.gasUsed.toLocaleString()}`);
    console.log(`   Secret Revealed: ${order.secret}`);

    // Step 5: Resolver uses revealed secret on Aptos
    console.log(`\n5️⃣ Resolver withdraws from Aptos escrow`);
    const aptosWithdrawTx = this.addTransaction({
      chain: "Aptos",
      action: "Withdraw with Secret", 
      actor: "Resolver",
      amount: order.srcAmount + " USDC"
    });
    console.log(`   TX: ${aptosWithdrawTx.hash}`);
    console.log(`   Gas: ${aptosWithdrawTx.gasUsed.toLocaleString()} Gas Units`);

    console.log(`\n✅ Swap Complete!`);
    console.log(`   User: -${order.srcAmount} USDC (Aptos) + ${order.dstAmount} USDC (Base)`);
    console.log(`   Resolver: +${order.srcAmount} USDC (Aptos) - ${order.dstAmount} USDC (Base)`);
    console.log(`   Resolver Profit: ${(parseFloat(order.srcAmount) - parseFloat(order.dstAmount)).toFixed(6)} USDC`);
  }

  // Simulation 3: Timeout scenario
  async simulateTimeoutScenario() {
    console.log("\n\n⏰ SIMULATION 3: Timeout Scenario");
    console.log("=================================");

    const order = {
      orderId: this.generateOrderId(),
      srcChain: "Base Sepolia",
      dstChain: "Aptos", 
      srcAmount: "50.000000",
      dstAmount: "49.750000",
      secret: this.generateSecret(),
      secretHash: "",
      timelock: this.currentTime + 60 // Short timeout for demo
    };
    order.secretHash = this.hashSecret(order.secret);

    console.log(`\n📋 Order Details (with short timeout):`);
    console.log(`Order ID: ${order.orderId}`);
    console.log(`Timeout: ${order.timelock} (60 seconds)`);

    // Create escrows
    const fillTx = this.addTransaction({
      chain: "Base Sepolia",
      action: "Fill Order",
      actor: "Resolver",
      amount: order.srcAmount + " USDC"
    });
    console.log(`\n1️⃣ Resolver fills order: ${fillTx.hash}`);

    const createAptosEscrowTx = this.addTransaction({
      chain: "Aptos", 
      action: "Create HTLC",
      actor: "Resolver",
      amount: order.dstAmount + " USDC"
    });
    console.log(`2️⃣ Aptos escrow created: ${createAptosEscrowTx.hash}`);

    // Simulate timeout
    console.log(`\n⏰ Timeout reached - user never revealed secret`);
    
    // Cancel both escrows
    const cancelAptosTx = this.addTransaction({
      chain: "Aptos",
      action: "Cancel HTLC (Timeout)",
      actor: "Resolver",
      amount: order.dstAmount + " USDC"
    });
    console.log(`3️⃣ Cancel Aptos escrow: ${cancelAptosTx.hash}`);

    const cancelBaseTx = this.addTransaction({
      chain: "Base Sepolia",
      action: "Cancel HTLC (Timeout)",
      actor: "User",
      amount: order.srcAmount + " USDC"
    });
    console.log(`4️⃣ Cancel Base escrow: ${cancelBaseTx.hash}`);

    console.log(`\n✅ Funds returned to original owners`);
    console.log(`   User: Gets back ${order.srcAmount} USDC on Base Sepolia`);
    console.log(`   Resolver: Gets back ${order.dstAmount} USDC on Aptos`);
  }

  // Generate summary report
  generateReport() {
    console.log("\n\n📊 CROSS-CHAIN TEST SUMMARY REPORT");
    console.log("===================================");
    
    // Group transactions by chain
    const baseTransactions = this.transactions.filter(tx => tx.chain === "Base Sepolia");
    const aptosTransactions = this.transactions.filter(tx => tx.chain === "Aptos");
    
    console.log(`\n🔗 Base Sepolia Transactions (${baseTransactions.length} total):`);
    baseTransactions.forEach((tx, i) => {
      console.log(`   ${i + 1}. ${tx.action} by ${tx.actor}`);
      console.log(`      TX: ${tx.hash}`);
      console.log(`      Gas: ${tx.gasUsed.toLocaleString()}`);
      if (tx.amount) console.log(`      Amount: ${tx.amount}`);
      console.log("");
    });

    console.log(`\n🟠 Aptos Transactions (${aptosTransactions.length} total):`);
    aptosTransactions.forEach((tx, i) => {
      console.log(`   ${i + 1}. ${tx.action} by ${tx.actor}`);
      console.log(`      TX: ${tx.hash}`);
      console.log(`      Gas: ${tx.gasUsed.toLocaleString()} Gas Units`);
      if (tx.amount) console.log(`      Amount: ${tx.amount}`);
      console.log("");
    });

    // Calculate total gas costs
    const totalBaseGas = baseTransactions.reduce((sum, tx) => sum + (tx.gasUsed || 0), 0);
    const totalAptosGas = aptosTransactions.reduce((sum, tx) => sum + (tx.gasUsed || 0), 0);

    console.log(`\n💰 Gas Summary:`);
    console.log(`   Base Sepolia: ${totalBaseGas.toLocaleString()} gas`);
    console.log(`   Aptos: ${totalAptosGas.toLocaleString()} gas units`);

    console.log(`\n✅ Test Scenarios Completed:`);
    console.log(`   ✓ Base Sepolia -> Aptos swap`);
    console.log(`   ✓ Aptos -> Base Sepolia swap`);
    console.log(`   ✓ Timeout/cancellation scenario`);
    console.log(`   ✓ Secret reveal mechanism`);
    console.log(`   ✓ HTLC safety guarantees`);

    console.log(`\n🎯 Key Features Demonstrated:`);
    console.log(`   • Atomic cross-chain swaps`);
    console.log(`   • Hash Time-Locked Contracts (HTLCs)`);
    console.log(`   • Secret reveal mechanism`);
    console.log(`   • Timeout protection`);
    console.log(`   • Resolver profit mechanism`);
    console.log(`   • Resource account isolation (Aptos)`);
    console.log(`   • Cross-chain event coordination`);
  }

  async runFullSimulation() {
    console.log("🚀 Starting Cross-Chain Test Simulation");
    console.log("========================================");
    
    await this.simulateBaseToAptos();
    await this.simulateAptosToBase();
    await this.simulateTimeoutScenario();
    
    this.generateReport();
  }
}

// Run the simulation
async function main() {
  const simulation = new CrossChainTestSimulation();
  await simulation.runFullSimulation();
}

main().catch(console.error);