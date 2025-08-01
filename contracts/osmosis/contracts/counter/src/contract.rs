use cosmwasm_std::{
    entry_point, to_json_binary, Binary, Deps, DepsMut, Env, MessageInfo, Response, StdResult,
    Uint128,
};
use cw2::set_contract_version;

use crate::error::ContractError;
use crate::msg::{CountResponse, ExecuteMsg, InstantiateMsg, QueryMsg};
use crate::state::COUNT;

const CONTRACT_NAME: &str = "crates.io:counter";
const CONTRACT_VERSION: &str = env!("CARGO_PKG_VERSION");

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn instantiate(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: InstantiateMsg,
) -> Result<Response, ContractError> {
    set_contract_version(deps.storage, CONTRACT_NAME, CONTRACT_VERSION)?;
    COUNT.save(deps.storage, &msg.count)?;
    
    Ok(Response::new()
        .add_attribute("method", "instantiate")
        .add_attribute("count", msg.count.to_string()))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn execute(
    deps: DepsMut,
    _env: Env,
    _info: MessageInfo,
    msg: ExecuteMsg,
) -> Result<Response, ContractError> {
    match msg {
        ExecuteMsg::Increment {} => execute_increment(deps),
        ExecuteMsg::Decrement {} => execute_decrement(deps),
    }
}

pub fn execute_increment(deps: DepsMut) -> Result<Response, ContractError> {
    COUNT.update(deps.storage, |count| -> StdResult<_> {
        Ok(count + Uint128::new(1))
    })?;
    
    Ok(Response::new().add_attribute("method", "increment"))
}

pub fn execute_decrement(deps: DepsMut) -> Result<Response, ContractError> {
    COUNT.update(deps.storage, |count| -> Result<_, ContractError> {
        if count.is_zero() {
            return Err(ContractError::CountUnderflow {});
        }
        Ok(count - Uint128::new(1))
    })?;
    
    Ok(Response::new().add_attribute("method", "decrement"))
}

#[cfg_attr(not(feature = "library"), entry_point)]
pub fn query(deps: Deps, _env: Env, msg: QueryMsg) -> StdResult<Binary> {
    match msg {
        QueryMsg::GetCount {} => to_json_binary(&query_count(deps)?),
    }
}

fn query_count(deps: Deps) -> StdResult<CountResponse> {
    let count = COUNT.load(deps.storage)?;
    Ok(CountResponse { count })
}

#[cfg(test)]
mod tests {
    use super::*;
    use cosmwasm_std::testing::{mock_dependencies, mock_env, mock_info};
    use cosmwasm_std::{coins, Uint128};

    #[test]
    fn proper_initialization() {
        let mut deps = mock_dependencies();

        let msg = InstantiateMsg {
            count: Uint128::new(17),
        };
        let info = mock_info("creator", &coins(1000, "uosmo"));

        let res = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();
        assert_eq!(0, res.messages.len());

        let res = query(deps.as_ref(), mock_env(), QueryMsg::GetCount {}).unwrap();
        let value: CountResponse = cosmwasm_std::from_json(&res).unwrap();
        assert_eq!(Uint128::new(17), value.count);
    }

    #[test]
    fn increment() {
        let mut deps = mock_dependencies();

        let msg = InstantiateMsg {
            count: Uint128::new(17),
        };
        let info = mock_info("creator", &coins(2, "uosmo"));
        let _res = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        let info = mock_info("anyone", &coins(2, "uosmo"));
        let msg = ExecuteMsg::Increment {};
        let _res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        let res = query(deps.as_ref(), mock_env(), QueryMsg::GetCount {}).unwrap();
        let value: CountResponse = cosmwasm_std::from_json(&res).unwrap();
        assert_eq!(Uint128::new(18), value.count);
    }

    #[test]
    fn decrement() {
        let mut deps = mock_dependencies();

        let msg = InstantiateMsg {
            count: Uint128::new(17),
        };
        let info = mock_info("creator", &coins(2, "uosmo"));
        let _res = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        let info = mock_info("anyone", &coins(2, "uosmo"));
        let msg = ExecuteMsg::Decrement {};
        let _res = execute(deps.as_mut(), mock_env(), info, msg).unwrap();

        let res = query(deps.as_ref(), mock_env(), QueryMsg::GetCount {}).unwrap();
        let value: CountResponse = cosmwasm_std::from_json(&res).unwrap();
        assert_eq!(Uint128::new(16), value.count);
    }

    #[test]
    fn decrement_underflow() {
        let mut deps = mock_dependencies();

        let msg = InstantiateMsg {
            count: Uint128::new(0),
        };
        let info = mock_info("creator", &coins(2, "uosmo"));
        let _res = instantiate(deps.as_mut(), mock_env(), info, msg).unwrap();

        let info = mock_info("anyone", &coins(2, "uosmo"));
        let msg = ExecuteMsg::Decrement {};
        let res = execute(deps.as_mut(), mock_env(), info, msg);
        assert!(res.is_err());
    }
}