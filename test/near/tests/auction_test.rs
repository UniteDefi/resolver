use near_sdk::json_types::U128;
use near_sdk::serde_json;
use near_workspaces::{types::NearToken, Account, AccountId, Contract, Worker};
use std::path::Path;

const AUCTION_WASM: &str = "target/wasm32-unknown-unknown/release/dutch_auction.wasm";

#[tokio::test]
async fn test_auction_lifecycle() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let auction_contract = deploy_auction_contract(&worker).await?;
    
    // Create test accounts
    let seller = worker.dev_create_account().await?;
    let resolver = worker.dev_create_account().await?;
    let token = deploy_mock_token(&worker, &seller).await?;
    
    // Mint tokens to seller
    let mint_amount = U128(1000 * 10u128.pow(6)); // 1000 USDC
    mint_tokens(&token, &seller, mint_amount).await?;
    
    // Approve auction contract
    approve_tokens(&token, &seller, &auction_contract, mint_amount).await?;
    
    // Create auction
    let auction_id = "test-auction-001";
    let start_price = U128(110 * 10u128.pow(18)); // 1.1 NEAR
    let end_price = U128(90 * 10u128.pow(18)); // 0.9 NEAR
    let duration = 3600 * 10u64.pow(9); // 1 hour in nanoseconds
    
    let create_result = seller
        .call(auction_contract.id(), "create_auction")
        .args_json(serde_json::json!({
            "auction_id": auction_id,
            "token": token.id(),
            "amount": mint_amount,
            "start_price": start_price,
            "end_price": end_price,
            "duration": duration
        }))
        .deposit(NearToken::from_millinear(1)) // Storage deposit
        .transact()
        .await?;
    
    assert!(create_result.is_success());
    println!("Auction created successfully");
    
    // Check auction state
    let auction: serde_json::Value = auction_contract
        .call("get_auction")
        .args_json(serde_json::json!({
            "auction_id": auction_id
        }))
        .transact()
        .await?
        .json()?;
    
    assert_eq!(auction["auction_id"], auction_id);
    assert_eq!(auction["seller"], seller.id().to_string());
    assert_eq!(auction["is_settled"], false);
    
    // Get current price
    let current_price: U128 = auction_contract
        .call("get_current_price")
        .args_json(serde_json::json!({
            "auction_id": auction_id
        }))
        .transact()
        .await?
        .json()?;
    
    println!("Current price: {} yoctoNEAR", current_price.0);
    
    // Settle auction
    let settle_result = resolver
        .call(auction_contract.id(), "settle_auction")
        .args_json(serde_json::json!({
            "auction_id": auction_id
        }))
        .deposit(NearToken::from_yoctonear(current_price.0))
        .transact()
        .await?;
    
    assert!(settle_result.is_success());
    println!("Auction settled successfully");
    
    // Verify final state
    let final_auction: serde_json::Value = auction_contract
        .call("get_auction")
        .args_json(serde_json::json!({
            "auction_id": auction_id
        }))
        .transact()
        .await?
        .json()?;
    
    assert_eq!(final_auction["is_settled"], true);
    assert_eq!(final_auction["resolver"], resolver.id().to_string());
    
    // Check token balances
    let resolver_balance = get_token_balance(&token, &resolver).await?;
    assert_eq!(resolver_balance, mint_amount);
    println!("Resolver received tokens: {} microUSDC", resolver_balance.0);
    
    Ok(())
}

#[tokio::test]
async fn test_auction_timeout() -> Result<(), Box<dyn std::error::Error>> {
    let worker = near_workspaces::sandbox().await?;
    let auction_contract = deploy_auction_contract(&worker).await?;
    
    let seller = worker.dev_create_account().await?;
    let token = deploy_mock_token(&worker, &seller).await?;
    
    // Create auction with very short duration
    let auction_id = "timeout-test";
    let duration = 1 * 10u64.pow(9); // 1 second
    
    let create_result = seller
        .call(auction_contract.id(), "create_auction")
        .args_json(serde_json::json!({
            "auction_id": auction_id,
            "token": token.id(),
            "amount": U128(100),
            "start_price": U128(100),
            "end_price": U128(50),
            "duration": duration
        }))
        .deposit(NearToken::from_millinear(1))
        .transact()
        .await?;
    
    assert!(create_result.is_success());
    
    // Wait for timeout
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    
    // Try to settle after timeout - should fail
    let resolver = worker.dev_create_account().await?;
    let settle_result = resolver
        .call(auction_contract.id(), "settle_auction")
        .args_json(serde_json::json!({
            "auction_id": auction_id
        }))
        .deposit(NearToken::from_yoctonear(50))
        .transact()
        .await;
    
    assert!(settle_result.is_err() || !settle_result.unwrap().is_success());
    println!("Auction correctly expired after timeout");
    
    Ok(())
}

// Helper functions

async fn deploy_auction_contract(worker: &Worker<near_workspaces::network::Sandbox>) -> Result<Contract, Box<dyn std::error::Error>> {
    let wasm = std::fs::read(AUCTION_WASM)?;
    let contract = worker.dev_deploy(&wasm).await?;
    
    // Initialize
    contract
        .call("new")
        .transact()
        .await?
        .into_result()?;
    
    Ok(contract)
}

async fn deploy_mock_token(
    worker: &Worker<near_workspaces::network::Sandbox>,
    owner: &Account,
) -> Result<Contract, Box<dyn std::error::Error>> {
    // For testing, we'll use a simple NEP-141 token contract
    // In real tests, you'd deploy an actual token contract
    let token_wasm = include_bytes!("../test_token.wasm");
    let token = worker.dev_deploy(token_wasm).await?;
    
    token
        .call("new")
        .args_json(serde_json::json!({
            "owner_id": owner.id(),
            "total_supply": U128(1_000_000 * 10u128.pow(6)),
            "metadata": {
                "spec": "ft-1.0.0",
                "name": "Test USDC",
                "symbol": "USDC",
                "decimals": 6
            }
        }))
        .transact()
        .await?
        .into_result()?;
    
    Ok(token)
}

async fn mint_tokens(
    token: &Contract,
    account: &Account,
    amount: U128,
) -> Result<(), Box<dyn std::error::Error>> {
    account
        .call(token.id(), "mint")
        .args_json(serde_json::json!({
            "account_id": account.id(),
            "amount": amount
        }))
        .transact()
        .await?
        .into_result()?;
    
    Ok(())
}

async fn approve_tokens(
    token: &Contract,
    owner: &Account,
    spender: &Contract,
    amount: U128,
) -> Result<(), Box<dyn std::error::Error>> {
    owner
        .call(token.id(), "ft_approve")
        .args_json(serde_json::json!({
            "spender_id": spender.id(),
            "amount": amount
        }))
        .deposit(NearToken::from_yoctonear(1))
        .transact()
        .await?
        .into_result()?;
    
    Ok(())
}

async fn get_token_balance(
    token: &Contract,
    account: &Account,
) -> Result<U128, Box<dyn std::error::Error>> {
    let balance: U128 = token
        .call("ft_balance_of")
        .args_json(serde_json::json!({
            "account_id": account.id()
        }))
        .transact()
        .await?
        .json()?;
    
    Ok(balance)
}