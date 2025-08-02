use cosmwasm_std::{
    Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
};
use cw20_base::contract::{execute as cw20_execute, instantiate as cw20_instantiate, query as cw20_query};
use cw20_base::msg::{ExecuteMsg as Cw20ExecuteMsg, InstantiateMsg as Cw20InstantiateMsg};

use crate::error::ContractError;
use crate::msg::{ExecuteMsg, InstantiateMsg, QueryMsg, TokenType};

pub fn instantiate(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    match msg.token_type {
        TokenType::MockUSDT => {
            let cw20_msg = Cw20InstantiateMsg {
                name: "Mock USDT".to_string(),
                symbol: "MUSDT".to_string(),
                decimals: 6,
                initial_balances: vec![],
                mint: Some(cw20::MinterResponse {
                    minter: info.sender.to_string(),
                    cap: None,
                }),
                marketing: None,
            };
            cw20_instantiate(deps, env, info, cw20_msg)
                .map_err(ContractError::from)
        }
        TokenType::MockDAI => {
            let cw20_msg = Cw20InstantiateMsg {
                name: "Mock DAI".to_string(),
                symbol: "MDAI".to_string(),
                decimals: 18,
                initial_balances: vec![],
                mint: Some(cw20::MinterResponse {
                    minter: info.sender.to_string(),
                    cap: None,
                }),
                marketing: None,
            };
            cw20_instantiate(deps, env, info, cw20_msg)
                .map_err(ContractError::from)
        }
        TokenType::MockWrappedNative => {
            let cw20_msg = Cw20InstantiateMsg {
                name: "Mock Wrapped Native".to_string(),
                symbol: "MWOSMO".to_string(),
                decimals: 6,
                initial_balances: vec![],
                mint: Some(cw20::MinterResponse {
                    minter: info.sender.to_string(),
                    cap: None,
                }),
                marketing: None,
            };
            cw20_instantiate(deps, env, info, cw20_msg)
                .map_err(ContractError::from)
        }
    }
}

pub fn execute(
    deps: DepsMut,
    env: Env,
    info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Mint { recipient, amount } => {
            let cw20_msg = Cw20ExecuteMsg::Mint { recipient, amount };
            cw20_execute(deps, env, info, cw20_msg)
                .map_err(ContractError::from)
        }
        ExecuteMsg::FakeMint { recipient, amount } => {
            let cw20_msg = Cw20ExecuteMsg::Mint { recipient, amount };
            cw20_execute(deps, env, info, cw20_msg)
                .map_err(ContractError::from)
        }
        ExecuteMsg::Cw20(cw20_msg) => {
            cw20_execute(deps, env, info, cw20_msg)
                .map_err(ContractError::from)
        }
    }
}

pub fn query(deps: Deps, env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::Cw20(cw20_msg) => cw20_query(deps, env, cw20_msg),
    }
}