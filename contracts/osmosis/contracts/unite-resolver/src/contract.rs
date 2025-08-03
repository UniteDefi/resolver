use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Addr, Uint128, WasmMsg, CosmosMsg, Coin, Reply,
};
use cw2::set_contract_version;
use sha2::{Digest, Sha256};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg, ConfigResponse};
use crate::state::{CONFIG, ORDER_FILLS, ESCROW_ADDRESSES, Config};
use crate::types::{Order, Immutables};
use crate::dutch_auction::DutchAuction;

const CONTRACT_NAME: &str = "crates.io:unite-resolver";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const INSTANTIATE_ESCROW_REPLY_ID: u64 = 1;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    
    let config = Config {
        owner: info.sender,
        factory: msg.factory,
        order_protocol: msg.order_protocol,
    };
    CONFIG.save(deps.storage, &config)?;
    
    Ok(Response::new().add_attribute("method", "instantiate"))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::DeploySrc { immutables, order, signature, amount } => {
            execute_deploy_src(deps, env, info, immutables, order, signature, amount, amount)
        }
        ExecuteMsg::DeploySrcPartial { immutables, order, signature, amount, partial_amount } => {
            execute_deploy_src(deps, env, info, immutables, order, signature, amount, partial_amount)
        }
        ExecuteMsg::DeployDst { immutables, src_cancellation_timestamp } => {
            let amount = immutables.amount;
            execute_deploy_dst(deps, env, info, immutables, src_cancellation_timestamp, amount)
        }
        ExecuteMsg::DeployDstPartial { immutables, src_cancellation_timestamp, partial_amount } => {
            execute_deploy_dst(deps, env, info, immutables, src_cancellation_timestamp, partial_amount)
        }
        ExecuteMsg::FillOrder { immutables, order, src_cancellation_timestamp, src_amount } => {
            execute_fill_order(deps, env, info, immutables, order, src_cancellation_timestamp, src_amount)
        }
        ExecuteMsg::ApproveToken { token, amount } => {
            execute_approve_token(deps, env, info, token, amount)
        }
        ExecuteMsg::Withdraw { escrow, secret, immutables } => {
            execute_withdraw(deps, env, info, escrow, secret, immutables)
        }
        ExecuteMsg::Cancel { escrow, immutables } => {
            execute_cancel(deps, env, info, escrow, immutables)
        }
    }
}

pub fn execute_deploy_src(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    immutables: Immutables,
    order: Order,
    _signature: String,
    _amount: Uint128,
    partial_amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    // Only owner can deploy source escrows
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized {});
    }
    
    // Calculate order hash
    let order_hash = calculate_order_hash(&order);
    
    // Check if this is the first fill for this order
    let existing_escrow = ESCROW_ADDRESSES.may_load(deps.storage, order_hash.clone())?;
    
    let safety_deposit = info.funds.iter()
        .find(|coin| coin.denom == "uosmo")
        .map(|coin| coin.amount)
        .unwrap_or(Uint128::zero());
    
    if safety_deposit.is_zero() {
        return Err(ContractError::NoSafetyDeposit {});
    }
    
    let mut messages = vec![];
    
    if let Some(escrow_address) = existing_escrow {
        // Subsequent resolver - add to existing escrow
        messages.push(CosmosMsg::Wasm(WasmMsg::Execute {
            contract_addr: escrow_address.to_string(),
            msg: to_json_binary(&EscrowExecuteMsg::AddResolverSafetyDeposit {
                resolver: info.sender.clone(),
                partial_amount,
            })?,
            funds: info.funds,
        }));
    } else {
        // First resolver - create new escrow through factory
        let create_msg = to_json_binary(&FactoryExecuteMsg::CreateSrcEscrowPartialFor {
            immutables: immutables.clone(),
            partial_amount,
            resolver: info.sender.clone(),
        })?;
        
        messages.push(CosmosMsg::Wasm(WasmMsg::Execute {
            contract_addr: config.factory.to_string(),
            msg: create_msg,
            funds: info.funds,
        }));
        
        // TODO: We need to capture the escrow address from the factory response
        // For now, we'll assume the factory handles this correctly
    }
    
    // TODO: Handle order filling through order protocol
    // This would require interaction with the order protocol contract
    
    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("method", "deploy_src")
        .add_attribute("order_hash", order_hash)
        .add_attribute("partial_amount", partial_amount.to_string()))
}

pub fn execute_deploy_dst(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    immutables: Immutables,
    src_cancellation_timestamp: u64,
    partial_amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    let safety_deposit = info.funds.iter()
        .find(|coin| coin.denom == "uosmo")
        .map(|coin| coin.amount)
        .unwrap_or(Uint128::zero());
    
    if safety_deposit.is_zero() {
        return Err(ContractError::NoSafetyDeposit {});
    }
    
    // Deploy destination escrow through factory
    let create_msg = to_json_binary(&FactoryExecuteMsg::CreateDstEscrowPartialFor {
        immutables: immutables.clone(),
        src_cancellation_timestamp,
        partial_amount,
        resolver: info.sender.clone(),
    })?;
    
    let mut messages = vec![];
    
    messages.push(CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.factory.to_string(),
        msg: create_msg,
        funds: vec![Coin {
            denom: "uosmo".to_string(),
            amount: safety_deposit,
        }],
    }));
    
    // Transfer destination tokens to escrow
    // For native tokens (uosmo), we would send them directly
    // For CW20 tokens, we would need a different approach
    if immutables.token == "uosmo" {
        // Native token transfer would be handled differently
    } else {
        // CW20 token transfer
        // TODO: Implement CW20 transfer
    }
    
    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("method", "deploy_dst")
        .add_attribute("order_hash", immutables.order_hash)
        .add_attribute("partial_amount", partial_amount.to_string()))
}

pub fn execute_fill_order(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    immutables: Immutables,
    order: Order,
    src_cancellation_timestamp: u64,
    src_amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    if src_amount.is_zero() {
        return Err(ContractError::InvalidSrcAmount {});
    }
    
    // Calculate order hash
    let order_hash = calculate_order_hash(&order);
    
    // Check if order is already completed
    let filled_amount = ORDER_FILLS.may_load(deps.storage, order_hash.clone())?.unwrap_or(0);
    if filled_amount >= order.making_amount.u128() {
        return Err(ContractError::OrderCompleted {});
    }
    
    // Check remaining amount
    let remaining_amount = order.making_amount.checked_sub(Uint128::from(filled_amount))?;
    if src_amount > remaining_amount {
        return Err(ContractError::InvalidSrcAmount {});
    }
    
    // Calculate destination amount based on current Dutch auction price
    let current_time = env.block.time.seconds();
    let dest_amount = DutchAuction::calculate_taking_amount(
        src_amount,
        order.start_price,
        order.end_price,
        order.auction_start_time,
        order.auction_end_time,
        current_time,
    )?;
    
    let safety_deposit = info.funds.iter()
        .find(|coin| coin.denom == "uosmo")
        .map(|coin| coin.amount)
        .unwrap_or(Uint128::zero());
    
    if safety_deposit.is_zero() {
        return Err(ContractError::NoSafetyDeposit {});
    }
    
    // Deploy destination escrow with calculated amount
    let create_msg = to_json_binary(&FactoryExecuteMsg::CreateDstEscrowPartialFor {
        immutables: immutables.clone(),
        src_cancellation_timestamp,
        partial_amount: dest_amount,
        resolver: info.sender.clone(),
    })?;
    
    let mut messages = vec![];
    
    messages.push(CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: config.factory.to_string(),
        msg: create_msg,
        funds: vec![Coin {
            denom: "uosmo".to_string(),
            amount: safety_deposit,
        }],
    }));
    
    // Update fill tracking
    ORDER_FILLS.save(deps.storage, order_hash.clone(), &(filled_amount + src_amount.u128()))?;
    
    // Get current price for event
    let current_price = DutchAuction::get_current_price(
        order.start_price,
        order.end_price,
        order.auction_start_time,
        order.auction_end_time,
        current_time,
    )?;
    
    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("method", "fill_order")
        .add_attribute("order_hash", order_hash)
        .add_attribute("src_amount", src_amount.to_string())
        .add_attribute("dest_amount", dest_amount.to_string())
        .add_attribute("current_price", current_price.to_string()))
}

pub fn execute_approve_token(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    _token: String,
    _amount: Uint128,
) -> Result<Response, ContractError> {
    let config = CONFIG.load(deps.storage)?;
    
    // Only owner can approve tokens
    if info.sender != config.owner {
        return Err(ContractError::Unauthorized {});
    }
    
    // For CW20 tokens, we would create an approve message here
    // For native tokens, approval is not needed
    
    Ok(Response::new()
        .add_attribute("method", "approve_token"))
}

pub fn execute_withdraw(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    escrow: Addr,
    secret: String,
    immutables: Immutables,
) -> Result<Response, ContractError> {
    let withdraw_msg = to_json_binary(&EscrowExecuteMsg::WithdrawWithSecret {
        secret,
        immutables,
    })?;
    
    let msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: escrow.to_string(),
        msg: withdraw_msg,
        funds: vec![],
    });
    
    Ok(Response::new()
        .add_message(msg)
        .add_attribute("method", "withdraw")
        .add_attribute("escrow", escrow.to_string()))
}

pub fn execute_cancel(
    _deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    escrow: Addr,
    immutables: Immutables,
) -> Result<Response, ContractError> {
    let cancel_msg = to_json_binary(&EscrowExecuteMsg::Cancel {
        immutables,
    })?;
    
    let msg = CosmosMsg::Wasm(WasmMsg::Execute {
        contract_addr: escrow.to_string(),
        msg: cancel_msg,
        funds: vec![],
    });
    
    Ok(Response::new()
        .add_message(msg)
        .add_attribute("method", "cancel")
        .add_attribute("escrow", escrow.to_string()))
}

// Helper function to calculate order hash
fn calculate_order_hash(order: &Order) -> String {
    let mut hasher = Sha256::new();
    
    // Create a deterministic string representation of the order
    let order_string = format!(
        "{}-{}-{}-{}-{}-{}-{}-{}-{}-{}-{}-{}-{}-{}-{}",
        order.salt,
        order.maker,
        order.receiver,
        order.maker_asset,
        order.taker_asset,
        order.making_amount,
        order.taking_amount,
        order.deadline,
        order.nonce,
        order.src_chain_id,
        order.dst_chain_id,
        order.auction_start_time,
        order.auction_end_time,
        order.start_price,
        order.end_price
    );
    
    hasher.update(order_string.as_bytes());
    hex::encode(hasher.finalize())
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetConfig {} => to_json_binary(&query_config(deps)?),
        QueryMsg::GetOrderHash { order } => to_json_binary(&query_order_hash(order)?),
    }
}

fn query_config(deps: Deps) -> StdResult<ConfigResponse> {
    let config = CONFIG.load(deps.storage)?;
    Ok(ConfigResponse {
        owner: config.owner,
        factory: config.factory,
        order_protocol: config.order_protocol,
    })
}

fn query_order_hash(order: Order) -> StdResult<String> {
    Ok(calculate_order_hash(&order))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn reply(_deps: DepsMut, _env: Env, msg: Reply) -> Result<Response, ContractError> {
    match msg.id {
        INSTANTIATE_ESCROW_REPLY_ID => {
            // Handle escrow instantiation reply
            // Extract the escrow address and store it
            Ok(Response::new())
        }
        _ => Err(ContractError::UnknownReplyId { id: msg.id }),
    }
}

// Message types for external contracts
#[derive(serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EscrowExecuteMsg {
    AddResolverSafetyDeposit {
        resolver: Addr,
        partial_amount: Uint128,
    },
    WithdrawWithSecret {
        secret: String,
        immutables: Immutables,
    },
    Cancel {
        immutables: Immutables,
    },
}

#[derive(serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum FactoryExecuteMsg {
    CreateSrcEscrowPartialFor {
        immutables: Immutables,
        partial_amount: Uint128,
        resolver: Addr,
    },
    CreateDstEscrowPartialFor {
        immutables: Immutables,
        src_cancellation_timestamp: u64,
        partial_amount: Uint128,
        resolver: Addr,
    },
}