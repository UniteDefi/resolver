use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Addr, Uint128, BankMsg, CosmosMsg, Coin,
};
use cw2::set_contract_version;
use sha2::{Digest, Sha256};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg, EscrowInstantiateMsg};
use crate::state::{ESCROW_STATE, RESOLVER_DEPOSITS, EscrowState, ResolverDeposit};
use crate::types::{Immutables, EscrowType, State};

const CONTRACT_NAME: &str = "crates.io:unite-escrow";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    msg: EscrowInstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    
    let state = EscrowState {
        immutables: msg.immutables,
        escrow_type: msg.escrow_type,
        src_cancellation_timestamp: msg.src_cancellation_timestamp,
        state: State::Active,
        deployed_at: env.block.time.seconds(),
        total_partial_amount: Uint128::zero(),
        funds_distributed: false,
    };
    
    ESCROW_STATE.save(deps.storage, &state)?;
    
    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("order_hash", state.immutables.order_hash))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::AddResolverDeposit { 
            resolver, 
            partial_amount 
        } => {
            execute_add_resolver_deposit(deps, env, info, resolver, partial_amount)
        }
        ExecuteMsg::WithdrawWithSecret { 
            secret, 
            immutables 
        } => {
            execute_withdraw_with_secret(deps, env, info, secret, immutables)
        }
        ExecuteMsg::Cancel { immutables } => {
            execute_cancel(deps, env, info, immutables)
        }
    }
}

pub fn execute_add_resolver_deposit(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    resolver: Addr,
    partial_amount: Uint128,
) -> Result<Response, ContractError> {
    let mut state = ESCROW_STATE.load(deps.storage)?;
    
    if RESOLVER_DEPOSITS.may_load(deps.storage, &resolver)?.is_some() {
        return Err(ContractError::ResolverAlreadyExists {});
    }
    
    let safety_deposit = info.funds.iter()
        .find(|coin| coin.denom == "uosmo")
        .map(|coin| coin.amount)
        .unwrap_or(Uint128::zero());
    
    if safety_deposit.is_zero() {
        return Err(ContractError::NoSafetyDeposit {});
    }
    
    let deposit = ResolverDeposit {
        partial_amount,
        safety_deposit,
        withdrawn: false,
    };
    RESOLVER_DEPOSITS.save(deps.storage, &resolver, &deposit)?;
    
    state.total_partial_amount = state.total_partial_amount.checked_add(partial_amount)?;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    Ok(Response::new()
        .add_attribute("method", "add_resolver_deposit")
        .add_attribute("resolver", resolver)
        .add_attribute("partial_amount", partial_amount))
}

pub fn execute_withdraw_with_secret(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    secret: String,
    immutables: Immutables,
) -> Result<Response, ContractError> {
    let mut state = ESCROW_STATE.load(deps.storage)?;
    
    if state.state != State::Active {
        return Err(ContractError::InvalidState {});
    }
    
    verify_immutables(&state.immutables, &immutables)?;
    verify_secret(&secret, &state.immutables.hashlock)?;
    
    if state.funds_distributed {
        return Err(ContractError::AlreadyWithdrawn {});
    }
    
    let mut msgs = vec![];
    
    let resolvers: Result<Vec<_>, _> = RESOLVER_DEPOSITS
        .range(deps.storage, None, None, cosmwasm_std::Order::Ascending)
        .collect();
    
    for (resolver, deposit) in resolvers? {
        if !deposit.safety_deposit.is_zero() {
            msgs.push(CosmosMsg::Bank(BankMsg::Send {
                to_address: resolver.to_string(),
                amount: vec![Coin {
                    denom: "uosmo".to_string(),
                    amount: deposit.safety_deposit,
                }],
            }));
        }
    }
    
    state.funds_distributed = true;
    state.state = State::Withdrawn;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    Ok(Response::new()
        .add_messages(msgs)
        .add_attribute("method", "withdraw_with_secret")
        .add_attribute("caller", info.sender))
}

pub fn execute_cancel(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    immutables: Immutables,
) -> Result<Response, ContractError> {
    let mut state = ESCROW_STATE.load(deps.storage)?;
    
    if state.state != State::Active {
        return Err(ContractError::InvalidState {});
    }
    
    verify_immutables(&state.immutables, &immutables)?;
    
    let mut msgs = vec![];
    
    let resolvers: Result<Vec<_>, _> = RESOLVER_DEPOSITS
        .range(deps.storage, None, None, cosmwasm_std::Order::Ascending)
        .collect();
    
    for (resolver, deposit) in resolvers? {
        if !deposit.safety_deposit.is_zero() {
            msgs.push(CosmosMsg::Bank(BankMsg::Send {
                to_address: resolver.to_string(),
                amount: vec![Coin {
                    denom: "uosmo".to_string(),
                    amount: deposit.safety_deposit,
                }],
            }));
        }
    }
    
    state.state = State::Cancelled;
    ESCROW_STATE.save(deps.storage, &state)?;
    
    Ok(Response::new()
        .add_messages(msgs)
        .add_attribute("method", "cancel")
        .add_attribute("caller", info.sender))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetEscrowState {} => to_json_binary(&ESCROW_STATE.load(deps.storage)?),
        QueryMsg::GetResolverDeposit { resolver } => {
            to_json_binary(&RESOLVER_DEPOSITS.may_load(deps.storage, &resolver)?)
        }
    }
}

fn verify_immutables(stored: &Immutables, provided: &Immutables) -> Result<(), ContractError> {
    if stored != provided {
        return Err(ContractError::InvalidImmutables {});
    }
    Ok(())
}

fn verify_secret(secret: &str, hashlock: &str) -> Result<(), ContractError> {
    let hash = Sha256::digest(secret.as_bytes());
    let calculated_hash = format!("{:x}", hash);
    
    if calculated_hash != hashlock {
        return Err(ContractError::InvalidSecret {});
    }
    
    Ok(())
}
