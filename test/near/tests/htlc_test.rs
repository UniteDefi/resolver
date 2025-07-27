use near_sdk::json_types::U128;
use near_sdk::serde_json;
use near_workspaces::{types::NearToken, Account, Contract, Worker};

const HTLC_WASM: &str = "target/wasm32-unknown-unknown/release/htlc_escrow.wasm";
const SAFETY_DEPOSIT: u128 = 1_000_000_000_000_000_000_000; // 0.001 NEAR

#[tokio::test]
async fn test_htlc_near_flow() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let htlc_contract = deploy_htlc_contract(&worker).await?;
    
    // Create test accounts
    let sender = worker.dev_create_account().await?;
    let receiver = worker.dev_create_account().await?;
    
    // Test parameters
    let secret = "test-secret-12345";
    let hashlock = hash_secret(&htlc_contract, secret).await?;
    let amount = U128(5 * 10u128.pow(24)); // 5 NEAR
    let timeout = 3600 * 10u64.pow(9); // 1 hour from now
    
    // Create HTLC
    let create_result = sender
        .call(htlc_contract.id(), "create_htlc")
        .args_json(serde_json::json!({
            "hashlock": hashlock,
            "receiver": receiver.id(),
            "token": null,
            "amount": amount,
            "timeout": timeout
        }))
        .deposit(NearToken::from_yoctonear(amount.0 + SAFETY_DEPOSIT))
        .transact()
        .await?;
    
    assert!(create_result.is_success());
    println!("HTLC created with hashlock: {}", hashlock);
    
    // Check HTLC state
    let htlc: serde_json::Value = htlc_contract
        .call("get_htlc")
        .args_json(serde_json::json!({
            "hashlock": hashlock
        }))
        .transact()
        .await?
        .json()?;
    
    assert_eq!(htlc["sender"], sender.id().to_string());
    assert_eq!(htlc["receiver"], receiver.id().to_string());
    assert_eq!(htlc["status"], "Active");
    
    // Withdraw with correct secret
    let receiver_balance_before = receiver.view_account().await?.balance;
    
    let withdraw_result = receiver
        .call(htlc_contract.id(), "withdraw")
        .args_json(serde_json::json!({
            "secret": secret,
            "hashlock": hashlock
        }))
        .transact()
        .await?;
    
    assert!(withdraw_result.is_success());
    println!("HTLC withdrawn successfully");
    
    // Verify final state
    let final_htlc: serde_json::Value = htlc_contract
        .call("get_htlc")
        .args_json(serde_json::json!({
            "hashlock": hashlock
        }))
        .transact()
        .await?
        .json()?;
    
    assert_eq!(final_htlc["status"], "Withdrawn");
    assert_eq!(final_htlc["secret"], secret);
    
    // Check receiver balance increased
    let receiver_balance_after = receiver.view_account().await?.balance;
    let received = receiver_balance_after.as_yoctonear() - receiver_balance_before.as_yoctonear();
    assert!(received >= amount.0 + SAFETY_DEPOSIT - 10u128.pow(20)); // Allow for gas costs
    
    println!("Receiver received: {} NEAR", received as f64 / 10f64.powf(24.0));
    
    Ok(())
}

#[tokio::test]
async fn test_htlc_token_flow() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let htlc_contract = deploy_htlc_contract(&worker).await?;
    
    // Create test accounts and token
    let sender = worker.dev_create_account().await?;
    let receiver = worker.dev_create_account().await?;
    let token = deploy_mock_token(&worker, &sender).await?;
    
    // Mint tokens to sender
    let token_amount = U128(1000 * 10u128.pow(6)); // 1000 USDC
    mint_tokens(&token, &sender, token_amount).await?;
    
    // Test parameters
    let secret = "token-secret-456";
    let hashlock = hash_secret(&htlc_contract, secret).await?;
    let timeout = 3600 * 10u64.pow(9);
    
    // Create HTLC with tokens
    let create_result = sender
        .call(htlc_contract.id(), "create_htlc")
        .args_json(serde_json::json!({
            "hashlock": hashlock,
            "receiver": receiver.id(),
            "token": token.id(),
            "amount": token_amount,
            "timeout": timeout
        }))
        .deposit(NearToken::from_yoctonear(SAFETY_DEPOSIT))
        .transact()
        .await?;
    
    assert!(create_result.is_success());
    
    // Withdraw tokens
    let withdraw_result = receiver
        .call(htlc_contract.id(), "withdraw")
        .args_json(serde_json::json!({
            "secret": secret,
            "hashlock": hashlock
        }))
        .transact()
        .await?;
    
    assert!(withdraw_result.is_success());
    
    // Verify token transfer
    let receiver_token_balance = get_token_balance(&token, &receiver).await?;
    assert_eq!(receiver_token_balance, token_amount);
    
    println!("Token HTLC completed successfully");
    
    Ok(())
}

#[tokio::test]
async fn test_htlc_timeout_cancellation() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let htlc_contract = deploy_htlc_contract(&worker).await?;
    
    let sender = worker.dev_create_account().await?;
    let receiver = worker.dev_create_account().await?;
    
    // Create HTLC with very short timeout
    let secret = "timeout-secret";
    let hashlock = hash_secret(&htlc_contract, secret).await?;
    let amount = U128(1 * 10u128.pow(24)); // 1 NEAR
    let timeout = 1 * 10u64.pow(9); // 1 second
    
    sender
        .call(htlc_contract.id(), "create_htlc")
        .args_json(serde_json::json!({
            "hashlock": hashlock,
            "receiver": receiver.id(),
            "token": null,
            "amount": amount,
            "timeout": timeout
        }))
        .deposit(NearToken::from_yoctonear(amount.0 + SAFETY_DEPOSIT))
        .transact()
        .await?;
    
    // Wait for timeout
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    
    // Try to withdraw after timeout - should fail
    let withdraw_result = receiver
        .call(htlc_contract.id(), "withdraw")
        .args_json(serde_json::json!({
            "secret": secret,
            "hashlock": hashlock
        }))
        .transact()
        .await;
    
    assert!(withdraw_result.is_err() || !withdraw_result.unwrap().is_success());
    
    // Cancel should succeed
    let sender_balance_before = sender.view_account().await?.balance;
    
    let cancel_result = sender
        .call(htlc_contract.id(), "cancel")
        .args_json(serde_json::json!({
            "hashlock": hashlock
        }))
        .transact()
        .await?;
    
    assert!(cancel_result.is_success());
    
    // Verify refund
    let sender_balance_after = sender.view_account().await?.balance;
    let refunded = sender_balance_after.as_yoctonear() - sender_balance_before.as_yoctonear();
    assert!(refunded >= amount.0 + SAFETY_DEPOSIT - 10u128.pow(20)); // Allow for gas costs
    
    println!("HTLC cancelled successfully after timeout");
    
    Ok(())
}

#[tokio::test]
async fn test_htlc_async_callbacks() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let htlc_contract = deploy_htlc_contract(&worker).await?;
    
    let sender = worker.dev_create_account().await?;
    let receiver = worker.dev_create_account().await?;
    
    // Create multiple HTLCs to test async handling
    let mut hashlocks = Vec::new();
    let amount = U128(1 * 10u128.pow(24));
    
    for i in 0..3 {
        let secret = format!("async-secret-{}", i);
        let hashlock = hash_secret(&htlc_contract, &secret).await?;
        hashlocks.push((hashlock.clone(), secret));
        
        sender
            .call(htlc_contract.id(), "create_htlc")
            .args_json(serde_json::json!({
                "hashlock": hashlock,
                "receiver": receiver.id(),
                "token": null,
                "amount": amount,
                "timeout": 3600 * 10u64.pow(9)
            }))
            .deposit(NearToken::from_yoctonear(amount.0 + SAFETY_DEPOSIT))
            .transact()
            .await?;
    }
    
    // Withdraw all HTLCs concurrently
    let mut futures = Vec::new();
    
    for (hashlock, secret) in hashlocks {
        let future = receiver
            .call(htlc_contract.id(), "withdraw")
            .args_json(serde_json::json!({
                "secret": secret,
                "hashlock": hashlock
            }))
            .transact();
        
        futures.push(future);
    }
    
    // Wait for all withdrawals
    let results = futures::future::join_all(futures).await;
    
    for result in results {
        assert!(result?.is_success());
    }
    
    println!("All async HTLC withdrawals completed successfully");
    
    Ok(())
}

// Helper functions

async fn deploy_htlc_contract(worker: &Worker<near_workspaces::network::Sandbox>) -> Result<Contract, Box<dyn std::error::Error>> {
    let wasm = std::fs::read(HTLC_WASM)?;
    let contract = worker.dev_deploy(&wasm).await?;
    
    contract
        .call("new")
        .transact()
        .await?
        .into_result()?;
    
    Ok(contract)
}

async fn hash_secret(contract: &Contract, secret: &str) -> Result<String, Box<dyn std::error::Error>> {
    let hash: String = contract
        .call("hash_secret")
        .args_json(serde_json::json!({
            "secret": secret
        }))
        .transact()
        .await?
        .json()?;
    
    Ok(hash)
}

async fn deploy_mock_token(
    worker: &Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
) -> Result<Contract, Box<dyn std::error::Error>> {
    // Mock token implementation would go here
    // For brevity, using a placeholder
    todo!("Implement mock token deployment")
}

async fn mint_tokens(
    token: &Contract,
    account: &Account,
    amount: U128,
) -> Result<(), Box<dyn std::error::Error>> {
    // Mock token minting would go here
    todo!("Implement token minting")
}

async fn get_token_balance(
    token: &Contract,
    account: &Account,
) -> Result<U128, Box<dyn std::error::Error>> {
    // Mock token balance check would go here
    todo!("Implement token balance check")
}