// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import "forge-std/Test.sol";
import "../src/UniteEscrowFactory.sol";
import "../src/mocks/MockERC20.sol";
import "../src/mocks/MockWrappedNative.sol";
import "../src/Resolver.sol";
import {IEscrowFactory} from "../lib/cross-chain-swap/contracts/interfaces/IEscrowFactory.sol";
import {IOrderMixin} from "../lib/cross-chain-swap/lib/limit-order-protocol/contracts/interfaces/IOrderMixin.sol";
import "../lib/cross-chain-swap/lib/limit-order-protocol/contracts/LimitOrderProtocol.sol";
import "@1inch/solidity-utils/contracts/interfaces/IWETH.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract UniteEscrowFactoryTest is Test {
    UniteEscrowFactory public factory;
    LimitOrderProtocol public lop;
    MockERC20 public feeToken;
    MockERC20 public accessToken;
    MockERC20 public usdt;
    MockERC20 public dai;
    MockWrappedNative public weth;
    Resolver[4] public resolvers;
    
    address public owner;
    address public relayer;
    address public user;
    
    function setUp() public {
        owner = address(this);
        relayer = makeAddr("relayer");
        user = makeAddr("user");
        
        // Deploy mock tokens
        weth = new MockWrappedNative("Wrapped Ether", "WETH");
        feeToken = new MockERC20("Fee Token", "FEE", 18);
        accessToken = new MockERC20("Access Token", "ACCESS", 18); 
        usdt = new MockERC20("USDT", "USDT", 6);
        dai = new MockERC20("DAI", "DAI", 18);
        
        // Deploy LimitOrderProtocol
        lop = new LimitOrderProtocol(IWETH(address(weth)));
        
        // Deploy UniteEscrowFactory
        factory = new UniteEscrowFactory(
            address(lop),
            IERC20(address(feeToken)),
            IERC20(address(accessToken)),
            owner,
            300,
            300
        );
        
        // Deploy 4 Resolver contracts
        for (uint i = 0; i < 4; i++) {
            address resolverOwner = address(uint160(uint256(keccak256(abi.encodePacked("resolver", i)))));
            resolvers[i] = new Resolver(
                IEscrowFactory(address(factory)),
                IOrderMixin(address(lop)),
                resolverOwner
            );
        }
        
        // Transfer tokens to user
        usdt.mint(user, 1000e6);
        dai.mint(user, 1000e18);
    }
    
    function testDeployments() public {
        assertEq(factory.owner(), owner);
        assertTrue(factory.authorizedRelayers(owner));
        // Factory inherits from EscrowFactory, doesn't expose limitOrderProtocol directly
        
        for (uint i = 0; i < 4; i++) {
            assertTrue(address(resolvers[i]) != address(0));
        }
    }
    
    function testRelayerAuthorization() public {
        // Authorize relayer
        factory.authorizeRelayer(relayer);
        assertTrue(factory.authorizedRelayers(relayer));
        
        // Revoke relayer
        factory.revokeRelayer(relayer);
        assertFalse(factory.authorizedRelayers(relayer));
    }
    
    function testUserFundTransfer() public {
        // Authorize relayer
        factory.authorizeRelayer(relayer);
        
        // User approves factory
        vm.prank(user);
        usdt.approve(address(factory), 100e6);
        
        // Transfer funds to escrow
        address escrow = makeAddr("escrow");
        vm.prank(relayer);
        factory.transferUserFundsToEscrow(user, address(usdt), 100e6, escrow);
        
        // Check balances
        assertEq(usdt.balanceOf(user), 900e6);
        assertEq(usdt.balanceOf(escrow), 100e6);
    }
    
    function testOnlyAuthorizedRelayerCanTransfer() public {
        address unauthorizedRelayer = makeAddr("unauthorized");
        
        // User approves
        vm.prank(user);
        usdt.approve(address(factory), 100e6);
        
        // Unauthorized relayer tries to transfer
        address escrow = makeAddr("escrow");
        vm.prank(unauthorizedRelayer);
        vm.expectRevert("Unauthorized relayer");
        factory.transferUserFundsToEscrow(user, address(usdt), 100e6, escrow);
    }
}