// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.23;

import {Test, console} from "forge-std/Test.sol";
import {SimpleDutchAuction} from "../../contracts/src/SimpleDutchAuction.sol";
import {EscrowSrc} from "../../contracts/lib/cross-chain-swap/contracts/EscrowSrc.sol";
import {EscrowDst} from "../../contracts/lib/cross-chain-swap/contracts/EscrowDst.sol";
import {MockToken} from "../../contracts/src/MockToken.sol";
import {Deploy} from "../../script/crosschain/DeployMonadBase.s.sol";
import {IBaseEscrow} from "../../contracts/lib/cross-chain-swap/contracts/interfaces/IBaseEscrow.sol";
import {Timelocks, TimelocksLib} from "../../contracts/lib/cross-chain-swap/contracts/libraries/TimelocksLib.sol";
import {Address} from "solidity-utils/contracts/libraries/AddressLib.sol";

contract MonadBaseHTLC is Test {
    SimpleDutchAuction auction;
    EscrowSrc escrowSrc;
    EscrowDst escrowDst;
    MockToken tokenOnMonad;
    MockToken tokenOnBaseSepolia;

    address constant auctionWinner = address(0x1);
    address constant seller = address(0x2);

    function setUp() public {
        Deploy deployer = new Deploy();
        MockToken tempTokenOnMonad;
        SimpleDutchAuction tempAuction;
        MockToken tempTokenOnBaseSepolia;
        (tempTokenOnMonad, tempAuction, /* escrowFactoryOnMonad */, tempTokenOnBaseSepolia, /* escrowFactoryOnBaseSepolia */) = deployer.run();
        tokenOnMonad = tempTokenOnMonad;
        auction = tempAuction;
        tokenOnBaseSepolia = tempTokenOnBaseSepolia;
    }

    function test_FullHTLCFlow() public {
        // 1. Create auction
        bytes32 auctionId = keccak256("my-auction");
        uint256 startPrice = 1 ether;
        uint256 endPrice = 0.5 ether;
        uint256 duration = 60 minutes;
        uint256 amount = 100 ether;

        vm.startPrank(seller);
        tokenOnMonad.mint(seller, amount);
        tokenOnMonad.approve(address(auction), amount);

        auction.createAuction(
            auctionId,
            address(tokenOnMonad),
            amount,
            startPrice,
            endPrice,
            duration
        );
        vm.stopPrank();

        // 2. Simulate resolver winning the auction
        vm.warp(block.timestamp + 30 minutes); // Fast forward time
        uint256 price = auction.getCurrentPrice(auctionId);
        vm.startPrank(auctionWinner);
        auction.settleAuction{value: price}(auctionId);
        vm.stopPrank();

        // 3. Execute HTLC swap
        bytes32 secret = keccak256(abi.encodePacked("my-secret"));
        bytes32 hash = keccak256(abi.encodePacked(secret));

        // 4. Create escrow on Monad
        // Create timelocks by packing uint32 values
        uint256 packedTimelocks = (uint32(2 hours)) | (uint32(3 hours) << 32) | (uint32(4 hours) << 64) | (uint32(1 hours) << 96) | (uint32(5 hours) << 128) | (uint32(6 hours) << 160);
        Timelocks timelocks = Timelocks.wrap(packedTimelocks);

        IBaseEscrow.Immutables memory immutablesSrc = IBaseEscrow.Immutables({
            escrow: address(escrowSrc),
            token: address(tokenOnMonad),
            amount: amount,
            taker: auctionWinner,
            maker: seller,
            timelocks: timelocks,
            safetyDeposit: 0
        });

        vm.startPrank(seller);
        tokenOnMonad.approve(address(escrowSrc), amount);
        escrowSrc.create(immutablesSrc);
        vm.stopPrank();

        // 5. Create escrow on Base Sepolia
        IBaseEscrow.Immutables memory immutablesDst = IBaseEscrow.Immutables({
            escrow: address(escrowDst),
            token: address(tokenOnBaseSepolia),
            amount: price,
            taker: seller,
            maker: auctionWinner,
            timelocks: timelocks,
            safetyDeposit: 0
        });

        vm.startPrank(auctionWinner);
        tokenOnBaseSepolia.mint(auctionWinner, price);
        tokenOnBaseSepolia.approve(address(escrowDst), price);
        escrowDst.create(immutablesDst);
        vm.stopPrank();

        // 6. Withdraw from Base Sepolia
        vm.startPrank(seller);
        escrowDst.withdraw(secret, immutablesDst);
        vm.stopPrank();

        // 7. Withdraw from Monad
        vm.startPrank(auctionWinner);
        escrowSrc.withdraw(secret, immutablesSrc);
        vm.stopPrank();

        // 8. Verify funds are correctly swapped
        assertEq(tokenOnMonad.balanceOf(auctionWinner), amount);
        assertEq(tokenOnBaseSepolia.balanceOf(seller), price);
    }

    function test_Timeout() public {
        // 1. Create auction
        bytes32 auctionId = keccak256("my-auction");
        uint256 startPrice = 1 ether;
        uint256 endPrice = 0.5 ether;
        uint256 duration = 60 minutes;
        uint256 amount = 100 ether;

        vm.startPrank(seller);
        tokenOnMonad.mint(seller, amount);
        tokenOnMonad.approve(address(auction), amount);

        auction.createAuction(
            auctionId,
            address(tokenOnMonad),
            amount,
            startPrice,
            endPrice,
            duration
        );
        vm.stopPrank();

        // 2. Simulate resolver winning the auction
        vm.warp(block.timestamp + 30 minutes); // Fast forward time
        uint256 price = auction.getCurrentPrice(auctionId);
        vm.startPrank(auctionWinner);
        auction.settleAuction{value: price}(auctionId);
        vm.stopPrank();

        // 3. Execute HTLC swap
        bytes32 secret = keccak256(abi.encodePacked("my-secret"));
        bytes32 hash = keccak256(abi.encodePacked(secret));

        // 4. Create escrow on Monad
        Timelocks timelocks = TimelocksLib.build(block.timestamp, 1 hours, 2 hours, 3 hours, 4 hours, 5 hours, 6 hours);

        IBaseEscrow.Immutables memory immutablesSrc = IBaseEscrow.Immutables({
            escrow: address(escrowSrc),
            token: address(tokenOnMonad),
            amount: amount,
            taker: auctionWinner,
            maker: seller,
            timelocks: timelocks,
            safetyDeposit: 0
        });

        vm.startPrank(seller);
        tokenOnMonad.approve(address(escrowSrc), amount);
        escrowSrc.create(immutablesSrc);
        vm.stopPrank();

        // 5. Create escrow on Base Sepolia
        IBaseEscrow.Immutables memory immutablesDst = IBaseEscrow.Immutables({
            escrow: address(escrowDst),
            token: address(tokenOnBaseSepolia),
            amount: price,
            taker: seller,
            maker: auctionWinner,
            timelocks: timelocks,
            safetyDeposit: 0
        });

        vm.startPrank(auctionWinner);
        tokenOnBaseSepolia.mint(auctionWinner, price);
        tokenOnBaseSepolia.approve(address(escrowDst), price);
        escrowDst.create(immutablesDst);
        vm.stopPrank();

        // 6. Fast forward time to after cancellation period
        vm.warp(block.timestamp + 4 hours);

        // 7. Cancel escrow on Base Sepolia
        vm.startPrank(auctionWinner);
        escrowDst.cancel(immutablesDst);
        vm.stopPrank();

        // 8. Cancel escrow on Monad
        vm.startPrank(seller);
        escrowSrc.cancel(immutablesSrc);
        vm.stopPrank();

        // 9. Verify funds are refunded
        assertEq(tokenOnMonad.balanceOf(seller), amount);
        assertEq(tokenOnBaseSepolia.balanceOf(auctionWinner), price);
    }
}