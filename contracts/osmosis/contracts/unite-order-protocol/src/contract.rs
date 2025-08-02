use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    StdError, Addr, Uint128, Timestamp,
};
use cw2::set_contract_version;
use sha2::{Digest, Sha256};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg, OrderResponse, OrderHashResponse};
use crate::state::{ORDERS, NONCES, FILLED_AMOUNTS, ESCROW_ADDRESSES, Config, CONFIG};
use crate::types::{Order, OrderStatus};

const CONTRACT_NAME: &str = "crates.io:unite-order-protocol";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    _msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    
    let config = Config {
        admin: info.sender.clone(),
        escrow_factory: None,
    };
    CONFIG.save(deps.storage, &config)?;
    
    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("admin", info.sender))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::CreateOrder { order, signature } => {
            execute_create_order(deps, env, info, order, signature)
        }
        ExecuteMsg::FillOrder { 
            order_hash, 
            making_amount, 
            taking_amount, 
            target 
        } => {
            execute_fill_order(deps, env, info, order_hash, making_amount, taking_amount, target)
        }
        ExecuteMsg::CancelOrder { order_hash } => {
            execute_cancel_order(deps, env, info, order_hash)
        }
        ExecuteMsg::SetEscrowFactory { address } => {
            execute_set_escrow_factory(deps, info, address)
        }
    }
}

pub fn execute_create_order(
    deps: DepsMut,
    env: Env,
    _info: MessageInfo,
    order: Order,
    _signature: String,
) -> Result<Response, ContractError> {
    if env.block.time >= Timestamp::from_seconds(order.deadline) {
        return Err(ContractError::OrderExpired {});
    }
    
    let current_nonce = NONCES.may_load(deps.storage, &order.maker)?
        .unwrap_or(Uint128::zero());
    if order.nonce != current_nonce {
        return Err(ContractError::InvalidNonce {});
    }
    
    let order_hash = calculate_order_hash(&order)?;
    ORDERS.save(deps.storage, order_hash.clone(), &order)?;
    FILLED_AMOUNTS.save(deps.storage, order_hash.clone(), &Uint128::zero())?;
    
    Ok(Response::new()
        .add_attribute("method", "create_order")
        .add_attribute("order_hash", order_hash)
        .add_attribute("maker", order.maker))
}

pub fn execute_fill_order(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    order_hash: String,
    making_amount: Uint128,
    _taking_amount: Uint128,
    target: Option<Addr>,
) -> Result<Response, ContractError> {
    let order = ORDERS.load(deps.storage, order_hash.clone())?;
    
    if env.block.time >= Timestamp::from_seconds(order.deadline) {
        return Err(ContractError::OrderExpired {});
    }
    
    let current_filled = FILLED_AMOUNTS.load(deps.storage, order_hash.clone())?;
    let remaining = order.making_amount.checked_sub(current_filled)?;
    
    if remaining.is_zero() {
        return Err(ContractError::OrderFullyFilled {});
    }
    
    let actual_making_amount = if making_amount > remaining {
        remaining
    } else {
        making_amount
    };
    
    let new_filled = current_filled.checked_add(actual_making_amount)?;
    FILLED_AMOUNTS.save(deps.storage, order_hash.clone(), &new_filled)?;
    
    let recipient = target.unwrap_or(info.sender.clone());
    if ESCROW_ADDRESSES.may_load(deps.storage, order_hash.clone())?.is_none() {
        ESCROW_ADDRESSES.save(deps.storage, order_hash.clone(), &recipient)?;
    }
    
    if new_filled >= order.making_amount {
        let new_nonce = NONCES.may_load(deps.storage, &order.maker)?
            .unwrap_or(Uint128::zero())
            .checked_add(Uint128::one())?;
        NONCES.save(deps.storage, &order.maker, &new_nonce)?;
    }
    
    Ok(Response::new()
        .add_attribute("method", "fill_order")
        .add_attribute("order_hash", order_hash)
        .add_attribute("making_amount", actual_making_amount))
}

pub fn execute_cancel_order(
    deps: DepsMut,
    _env: Env,
    info: MessageInfo,
    order_hash: String,
) -> Result<Response, ContractError> {
    let order = ORDERS.load(deps.storage, order_hash.clone())?;
    
    if order.maker != info.sender {
        return Err(ContractError::Unauthorized {});
    }
    
    FILLED_AMOUNTS.save(deps.storage, order_hash.clone(), &order.making_amount)?;
    
    Ok(Response::new()
        .add_attribute("method", "cancel_order")
        .add_attribute("order_hash", order_hash))
}

pub fn execute_set_escrow_factory(
    deps: DepsMut,
    info: MessageInfo,
    address: Addr,
) -> Result<Response, ContractError> {
    let mut config = CONFIG.load(deps.storage)?;
    
    if config.admin != info.sender {
        return Err(ContractError::Unauthorized {});
    }
    
    config.escrow_factory = Some(address.clone());
    CONFIG.save(deps.storage, &config)?;
    
    Ok(Response::new()
        .add_attribute("method", "set_escrow_factory")
        .add_attribute("factory", address))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetOrder { order_hash } => to_json_binary(&query_order(deps, order_hash)?),
        QueryMsg::GetOrderHash { order } => to_json_binary(&query_order_hash(order)?),
        QueryMsg::GetFilledAmount { order_hash } => to_json_binary(&query_filled_amount(deps, order_hash)?),
        QueryMsg::GetNonce { maker } => to_json_binary(&query_nonce(deps, maker)?),
    }
}

fn query_order(deps: Deps, order_hash: String) -> StdResult<OrderResponse> {
    let order = ORDERS.load(deps.storage, order_hash.clone())?;
    let filled_amount = FILLED_AMOUNTS.load(deps.storage, order_hash)?;
    
    let status = if filled_amount >= order.making_amount {
        OrderStatus::Filled
    } else if filled_amount.is_zero() {
        OrderStatus::Open
    } else {
        OrderStatus::PartiallyFilled
    };
    
    Ok(OrderResponse {
        order,
        filled_amount,
        status,
    })
}

fn query_order_hash(order: Order) -> StdResult<OrderHashResponse> {
    let hash = calculate_order_hash(&order).map_err(|e| StdError::generic_err(e.to_string()))?;
    Ok(OrderHashResponse { hash })
}

fn query_filled_amount(deps: Deps, order_hash: String) -> StdResult<Uint128> {
    FILLED_AMOUNTS.load(deps.storage, order_hash)
}

fn query_nonce(deps: Deps, maker: Addr) -> StdResult<Uint128> {
    Ok(NONCES.may_load(deps.storage, &maker)?.unwrap_or(Uint128::zero()))
}

fn calculate_order_hash(order: &Order) -> Result<String, ContractError> {
    let order_bytes = serde_json::to_vec(order)?;
    let hash = Sha256::digest(&order_bytes);
    Ok(format!("{:x}", hash))
}
