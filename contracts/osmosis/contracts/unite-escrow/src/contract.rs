use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Addr, Uint128, BankMsg, CosmosMsg, Coin, StdError,
};
use cw2::set_contract_version;
use sha2::{Digest, Sha256};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, QueryMsg, EscrowInstantiateMsg, EscrowStateResponse, ResolverInfoResponse};
use crate::state::{ESCROW_STATE, RESOLVER_DEPOSITS, RESOLVERS, EscrowState, ResolverDeposit};
use crate::types::{Immutables, State, EscrowType};

const CONTRACT_NAME: &str = "crates.io:unite-escrow";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");
const CALLER_REWARD_PERCENTAGE: u128 = 10;

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    _msg: EscrowInstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
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
        ExecuteMsg::Initialize { immutables, is_source } => {
            execute_initialize(deps, env, info, immutables, is_source)
        }
        ExecuteMsg::InitializeDst { immutables, src_cancellation_timestamp } => {
            execute_initialize_dst(deps, env, info, immutables, src_cancellation_timestamp)
        }
        ExecuteMsg::AddResolverSafetyDeposit { resolver, partial_amount } => {
            execute_add_resolver_safety_deposit(deps, env, info, resolver, partial_amount)
        }
        ExecuteMsg::WithdrawWithSecret { secret, immutables } => {
            execute_withdraw_with_secret(deps, env, info, secret, immutables)
        }
        ExecuteMsg::Cancel { immutables } => {
            execute_cancel(deps, env, info, immutables)
        }
        ExecuteMsg::HandleFirstResolver { resolver, partial_amount, resolver_deposit } => {
            execute_handle_first_resolver(deps, env, info, resolver, partial_amount, resolver_deposit)
        }
        ExecuteMsg::MarkUserFunded {} => {
            execute_mark_user_funded(deps, env, info)
        }
    }
}

pub fn execute_initialize(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    mut immutables: Immutables,
    is_source: bool,
) -> Result<Response, ContractError> {
    // Check if already initialized
    if ESCROW_STATE.may_load(deps.storage)?.is_some() {
        return Err(ContractError::AlreadyInitialized {});
    }
    
    // Set deployed_at timestamp
    immutables.timelocks.set_deployed_at(env.block.time.seconds());
    
    let state = EscrowState {
        immutables: immutables.clone(),
        escrow_type: if is_source { EscrowType::Source } else { EscrowType::Destination },
        src_cancellation_timestamp: None,
        state: State::Active,
        deployed_at: env.block.time.seconds(),
        total_partial_amount: Uint128::zero(),
        total_partial_withdrawn: Uint128::zero(),
        funds_distributed: false,
        user_funded: false,
        factory: info.sender,
    };
    
    ESCROW_STATE.save(deps.storage, &state)?;
    RESOLVERS.save(deps.storage, &vec![])?;
    
    Ok(Response::new()
        .add_attribute("method", "initialize")
        .add_attribute("order_hash", immutables.order_hash)
        .add_attribute("is_source", is_source.to_string()))
}

pub fn execute_initialize_dst(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    mut immutables: Immutables,
    src_cancellation_timestamp: u64,
) -> Result<Response, ContractError> {
    // Check if already initialized
    if ESCROW_STATE.may_load(deps.storage)?.is_some() {
        return Err(ContractError::AlreadyInitialized {});
    }
    
    // Set deployed_at timestamp
    immutables.timelocks.set_deployed_at(env.block.time.seconds());
    
    let state = EscrowState {
        immutables: immutables.clone(),
        escrow_type: EscrowType::Destination,
        src_cancellation_timestamp: Some(src_cancellation_timestamp),
        state: State::Active,
        deployed_at: env.block.time.seconds(),
        total_partial_amount: Uint128::zero(),
        total_partial_withdrawn: Uint128::zero(),
        funds_distributed: false,
        user_funded: false,
        factory: info.sender,
    };
    
    ESCROW_STATE.save(deps.storage, &state)?;
    RESOLVERS.save(deps.storage, &vec![])?;
    
    Ok(Response::new()
        .add_attribute("method", "initialize_dst")
        .add_attribute("order_hash", immutables.order_hash)
        .add_attribute("src_cancellation_timestamp", src_cancellation_timestamp.to_string()))
}

pub fn execute_add_resolver_safety_deposit(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    resolver: Addr,
    partial_amount: Uint128,
) -> Result<Response, ContractError> {
    // Check if initialized
    if ESCROW_STATE.may_load(deps.storage)?.is_none() {
        return Err(ContractError::NotInitialized {});
    }
    
    // Check if resolver already exists
    if RESOLVER_DEPOSITS.may_load(deps.storage, &resolver)?.is_some() {
        return Err(ContractError::ResolverAlreadyExists {});
    }
    
    if partial_amount.is_zero() {
        return Err(ContractError::InvalidPartialAmount {});
    }
    
    // Check safety deposit
    let safety_deposit = info.funds.iter()
        .find(|coin| coin.denom == "uosmo")
        .map(|coin| coin.amount)
        .unwrap_or(Uint128::zero());
    
    if safety_deposit.is_zero() {
        return Err(ContractError::NoSafetyDeposit {});
    }
    
    // Save resolver deposit
    let deposit = ResolverDeposit {
        partial_amount,
        safety_deposit,
        withdrawn: false,
    };
    RESOLVER_DEPOSITS.save(deps.storage, &resolver, &deposit)?;
    
    // Add to resolvers list
    let mut resolvers = RESOLVERS.load(deps.storage)?;
    resolvers.push(resolver.clone());
    RESOLVERS.save(deps.storage, &resolvers)?;
    
    // Update total partial amount
    let mut state = ESCROW_STATE.load(deps.storage)?;
    state.total_partial_amount = state.total_partial_amount.checked_add(partial_amount)?;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    Ok(Response::new()
        .add_attribute("method", "add_resolver_safety_deposit")
        .add_attribute("resolver", resolver.to_string())
        .add_attribute("partial_amount", partial_amount.to_string())
        .add_attribute("safety_deposit", safety_deposit.to_string()))
}

pub fn execute_withdraw_with_secret(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    secret: String,
    immutables: Immutables,
) -> Result<Response, ContractError> {
    let mut state = ESCROW_STATE.load(deps.storage)?;
    
    // Check if active
    if state.state != State::Active {
        return Err(ContractError::InvalidState {});
    }
    
    // Verify secret
    let secret_bytes = hex::decode(&secret).map_err(|_| ContractError::InvalidSecret {})?;
    let mut hasher = Sha256::new();
    hasher.update(&secret_bytes);
    let computed_hash = hex::encode(hasher.finalize());
    
    if computed_hash != state.immutables.hashlock {
        return Err(ContractError::InvalidSecret {});
    }
    
    // Verify immutables match
    verify_immutables(&state.immutables, &immutables)?;
    
    // Prevent double withdrawal
    if state.funds_distributed {
        return Err(ContractError::AlreadyWithdrawn {});
    }
    
    // For destination chain, check that all resolvers have deposited their promised tokens
    if matches!(state.escrow_type, EscrowType::Destination) {
        // In Osmosis, we need to check the contract's token balance
        // This would require querying the token contract balance
        // For now, we'll assume tokens are deposited as part of the transaction
    }
    
    // Check if caller should get reward
    let current_time = env.block.time.seconds();
    let deployed_at = state.immutables.timelocks.get_deployed_at();
    
    let is_after_time_limit = match state.escrow_type {
        EscrowType::Source => {
            current_time >= deployed_at + state.immutables.timelocks.src_public_withdrawal
        }
        EscrowType::Destination => {
            current_time >= deployed_at + state.immutables.timelocks.dst_public_withdrawal
        }
    };
    
    // Check if caller is eligible for reward
    let resolvers = RESOLVERS.load(deps.storage)?;
    let is_resolver = resolvers.iter().any(|r| r == &info.sender);
    let caller_gets_reward = is_after_time_limit && info.sender != state.immutables.maker && !is_resolver;
    
    // Calculate caller reward if applicable
    let mut caller_reward = Uint128::zero();
    if caller_gets_reward {
        let total_safety_deposits = calculate_total_safety_deposits(deps.as_ref(), &resolvers)?;
        caller_reward = total_safety_deposits.multiply_ratio(CALLER_REWARD_PERCENTAGE, 100u128);
    }
    
    state.funds_distributed = true;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    // Prepare messages for fund distribution
    let mut messages = vec![];
    
    match state.escrow_type {
        EscrowType::Source => {
            messages.extend(distribute_source_funds(deps.as_ref(), &state, &resolvers, caller_reward)?);
        }
        EscrowType::Destination => {
            messages.extend(distribute_destination_funds(deps.as_ref(), &state, &resolvers, caller_reward)?);
        }
    }
    
    // Send caller reward if applicable
    if !caller_reward.is_zero() {
        messages.push(CosmosMsg::Bank(BankMsg::Send {
            to_address: info.sender.to_string(),
            amount: vec![Coin {
                denom: "uosmo".to_string(),
                amount: caller_reward,
            }],
        }));
    }
    
    // Update state to withdrawn
    state.state = State::Withdrawn;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("method", "withdraw_with_secret")
        .add_attribute("caller", info.sender.to_string())
        .add_attribute("is_after_time_limit", is_after_time_limit.to_string())
        .add_attribute("caller_reward", caller_reward.to_string()))
}

pub fn execute_cancel(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    immutables: Immutables,
) -> Result<Response, ContractError> {
    let mut state = ESCROW_STATE.load(deps.storage)?;
    
    // Check if active
    if state.state != State::Active {
        return Err(ContractError::InvalidState {});
    }
    
    // Verify immutables match
    verify_immutables(&state.immutables, &immutables)?;
    
    // Check cancellation time windows
    let deployed_at = state.immutables.timelocks.get_deployed_at();
    let current_time = env.block.time.seconds();
    
    match state.escrow_type {
        EscrowType::Source => {
            let cancellation_time = deployed_at + state.immutables.timelocks.src_cancellation;
            let public_cancellation_time = deployed_at + state.immutables.timelocks.src_public_cancellation;
            
            if current_time < cancellation_time {
                return Err(ContractError::InvalidTime {});
            }
            if current_time < public_cancellation_time && info.sender != state.immutables.maker {
                return Err(ContractError::InvalidCaller {});
            }
        }
        EscrowType::Destination => {
            if let Some(src_cancel_time) = state.src_cancellation_timestamp {
                if current_time < src_cancel_time {
                    return Err(ContractError::InvalidTime {});
                }
            } else {
                return Err(ContractError::InvalidTime {});
            }
            
            let cancellation_time = deployed_at + state.immutables.timelocks.dst_cancellation;
            if current_time < cancellation_time {
                return Err(ContractError::InvalidTime {});
            }
        }
    }
    
    state.state = State::Cancelled;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    // Return all funds
    let mut messages = vec![];
    
    // Return tokens to maker (if any in contract)
    // In Osmosis, we would need to handle token transfers differently
    // For native tokens (uosmo), we can use BankMsg
    
    // Return safety deposits to resolvers
    let resolvers = RESOLVERS.load(deps.storage)?;
    for resolver in resolvers {
        if let Some(deposit) = RESOLVER_DEPOSITS.may_load(deps.storage, &resolver)? {
            if !deposit.safety_deposit.is_zero() {
                messages.push(CosmosMsg::Bank(BankMsg::Send {
                    to_address: resolver.to_string(),
                    amount: vec![Coin {
                        denom: "uosmo".to_string(),
                        amount: deposit.safety_deposit,
                    }],
                }));
            }
        }
    }
    
    Ok(Response::new()
        .add_messages(messages)
        .add_attribute("method", "cancel")
        .add_attribute("maker", state.immutables.maker.to_string())
        .add_attribute("amount", state.immutables.amount.to_string()))
}

pub fn execute_handle_first_resolver(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    resolver: Addr,
    partial_amount: Uint128,
    resolver_deposit: Uint128,
) -> Result<Response, ContractError> {
    // Only factory can call this
    let state = ESCROW_STATE.load(deps.storage)?;
    if info.sender != state.factory {
        return Err(ContractError::Unauthorized {});
    }
    
    // Check if resolvers list is empty
    let resolvers = RESOLVERS.load(deps.storage)?;
    if !resolvers.is_empty() {
        return Err(ContractError::FirstResolverAlreadySet {});
    }
    
    // Check if resolver already exists
    if RESOLVER_DEPOSITS.may_load(deps.storage, &resolver)?.is_some() {
        return Err(ContractError::ResolverAlreadyExists {});
    }
    
    if partial_amount.is_zero() {
        return Err(ContractError::InvalidPartialAmount {});
    }
    
    // Save resolver deposit
    let deposit = ResolverDeposit {
        partial_amount,
        safety_deposit: resolver_deposit,
        withdrawn: false,
    };
    RESOLVER_DEPOSITS.save(deps.storage, &resolver, &deposit)?;
    
    // Add to resolvers list
    RESOLVERS.save(deps.storage, &vec![resolver.clone()])?;
    
    // Update total partial amount
    let mut state = ESCROW_STATE.load(deps.storage)?;
    state.total_partial_amount = state.total_partial_amount.checked_add(partial_amount)?;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    Ok(Response::new()
        .add_attribute("method", "handle_first_resolver")
        .add_attribute("resolver", resolver.to_string())
        .add_attribute("partial_amount", partial_amount.to_string())
        .add_attribute("resolver_deposit", resolver_deposit.to_string()))
}

pub fn execute_mark_user_funded(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
) -> Result<Response, ContractError> {
    let mut state = ESCROW_STATE.load(deps.storage)?;
    
    // Only factory can call this
    if info.sender != state.factory {
        return Err(ContractError::Unauthorized {});
    }
    
    state.user_funded = true;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    Ok(Response::new()
        .add_attribute("method", "mark_user_funded"))
}

// Helper functions
fn verify_immutables(stored: &Immutables, provided: &Immutables) -> Result<(), ContractError> {
    if stored.order_hash != provided.order_hash ||
       stored.hashlock != provided.hashlock ||
       stored.maker != provided.maker ||
       stored.taker != provided.taker ||
       stored.token != provided.token ||
       stored.amount != provided.amount ||
       stored.safety_deposit != provided.safety_deposit {
        return Err(ContractError::InvalidImmutables {});
    }
    Ok(())
}

fn calculate_total_safety_deposits(
    deps: Deps,
    resolvers: &[Addr],
) -> StdResult<Uint128> {
    let mut total = Uint128::zero();
    for resolver in resolvers {
        if let Some(deposit) = RESOLVER_DEPOSITS.may_load(deps.storage, resolver)? {
            total = total.checked_add(deposit.safety_deposit)?;
        }
    }
    Ok(total)
}

fn distribute_source_funds(
    deps: Deps,
    state: &EscrowState,
    resolvers: &[Addr],
    caller_reward: Uint128,
) -> StdResult<Vec<CosmosMsg>> {
    let mut messages = vec![];
    
    for resolver in resolvers {
        if let Some(deposit) = RESOLVER_DEPOSITS.may_load(deps.storage, resolver)? {
            let resolver_amount = deposit.partial_amount;
            let mut actual_deposit = deposit.safety_deposit;
            
            // Deduct caller reward proportionally
            if !caller_reward.is_zero() {
                let deduction = deposit.safety_deposit.multiply_ratio(CALLER_REWARD_PERCENTAGE, 100u128);
                actual_deposit = deposit.safety_deposit.checked_sub(deduction)?;
            }
            
            // Send tokens to resolver
            if state.immutables.token == "uosmo" {
                // Native token
                let total_amount = resolver_amount.checked_add(actual_deposit)?;
                messages.push(CosmosMsg::Bank(BankMsg::Send {
                    to_address: resolver.to_string(),
                    amount: vec![Coin {
                        denom: "uosmo".to_string(),
                        amount: total_amount,
                    }],
                }));
            } else {
                // For CW20 tokens, we would need to handle differently
                // For now, assuming native tokens only
                
                // Return safety deposit
                if !actual_deposit.is_zero() {
                    messages.push(CosmosMsg::Bank(BankMsg::Send {
                        to_address: resolver.to_string(),
                        amount: vec![Coin {
                            denom: "uosmo".to_string(),
                            amount: actual_deposit,
                        }],
                    }));
                }
            }
        }
    }
    
    Ok(messages)
}

fn distribute_destination_funds(
    deps: Deps,
    state: &EscrowState,
    resolvers: &[Addr],
    caller_reward: Uint128,
) -> StdResult<Vec<CosmosMsg>> {
    let mut messages = vec![];
    
    // Send all tokens to user (maker)
    if state.immutables.token == "uosmo" {
        // Native token
        messages.push(CosmosMsg::Bank(BankMsg::Send {
            to_address: state.immutables.maker.to_string(),
            amount: vec![Coin {
                denom: "uosmo".to_string(),
                amount: state.total_partial_amount,
            }],
        }));
    } else {
        // For CW20 tokens, we would need to handle differently
    }
    
    // Return safety deposits to resolvers
    for resolver in resolvers {
        if let Some(deposit) = RESOLVER_DEPOSITS.may_load(deps.storage, resolver)? {
            let mut actual_deposit = deposit.safety_deposit;
            
            // Deduct caller reward proportionally
            if !caller_reward.is_zero() {
                let deduction = deposit.safety_deposit.multiply_ratio(CALLER_REWARD_PERCENTAGE, 100u128);
                actual_deposit = deposit.safety_deposit.checked_sub(deduction)?;
            }
            
            if !actual_deposit.is_zero() {
                messages.push(CosmosMsg::Bank(BankMsg::Send {
                    to_address: resolver.to_string(),
                    amount: vec![Coin {
                        denom: "uosmo".to_string(),
                        amount: actual_deposit,
                    }],
                }));
            }
        }
    }
    
    Ok(messages)
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetEscrowState {} => to_json_binary(&query_escrow_state(deps)?),
        QueryMsg::GetResolverCount {} => to_json_binary(&query_resolver_count(deps)?),
        QueryMsg::GetResolver { index } => to_json_binary(&query_resolver(deps, index)?),
        QueryMsg::GetResolverInfo { resolver } => to_json_binary(&query_resolver_info(deps, resolver)?),
    }
}

fn query_escrow_state(deps: Deps) -> StdResult<EscrowStateResponse> {
    let state = ESCROW_STATE.load(deps.storage)?;
    Ok(EscrowStateResponse {
        order_hash: state.immutables.order_hash,
        hashlock: state.immutables.hashlock,
        maker: state.immutables.maker,
        taker: state.immutables.taker,
        token: state.immutables.token,
        amount: state.immutables.amount,
        safety_deposit: state.immutables.safety_deposit,
        timelocks: state.immutables.timelocks,
        is_source: matches!(state.escrow_type, EscrowType::Source),
        src_cancellation_timestamp: state.src_cancellation_timestamp,
        state: state.state,
        total_partial_amount: state.total_partial_amount,
        total_partial_withdrawn: state.total_partial_withdrawn,
        funds_distributed: state.funds_distributed,
        user_funded: state.user_funded,
        factory: state.factory,
    })
}

fn query_resolver_count(deps: Deps) -> StdResult<u32> {
    let resolvers = RESOLVERS.load(deps.storage)?;
    Ok(resolvers.len() as u32)
}

fn query_resolver(deps: Deps, index: u32) -> StdResult<Addr> {
    let resolvers = RESOLVERS.load(deps.storage)?;
    resolvers
        .get(index as usize)
        .cloned()
        .ok_or_else(|| StdError::generic_err("Index out of bounds"))
}

fn query_resolver_info(deps: Deps, resolver: Addr) -> StdResult<ResolverInfoResponse> {
    let deposit = RESOLVER_DEPOSITS
        .may_load(deps.storage, &resolver)?
        .ok_or_else(|| StdError::generic_err("Resolver not found"))?;
    
    Ok(ResolverInfoResponse {
        partial_amount: deposit.partial_amount,
        safety_deposit: deposit.safety_deposit,
        withdrawn: deposit.withdrawn,
    })
}