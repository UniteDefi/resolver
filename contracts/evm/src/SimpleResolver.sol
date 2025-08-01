// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

import {Ownable} from "openzeppelin-contracts/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IOrderMixin.sol";
import "./interfaces/IEscrowFactory.sol";
import "./interfaces/IBaseEscrow.sol";
import "./interfaces/IEscrow.sol";
import "./libraries/TimelocksLib.sol";
import "./libraries/ImmutablesLib.sol";

contract SimpleResolver is Ownable {
    using SafeERC20 for IERC20;
    using ImmutablesLib for IBaseEscrow.Immutables;
    using TimelocksLib for uint256;

    error InvalidLength();
    error LengthMismatch();
    error TransferFailed();

    IEscrowFactory private immutable _FACTORY;
    IOrderMixin private immutable _LOP;

    event SrcEscrowDeployed(address indexed escrow, bytes32 indexed orderHash);
    event DstEscrowDeployed(address indexed escrow, bytes32 indexed orderHash);

    constructor(IEscrowFactory factory, IOrderMixin lop, address initialOwner) Ownable(initialOwner) {
        _FACTORY = factory;
        _LOP = lop;
    }

    receive() external payable {}

    function deploySrc(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount
    ) external payable onlyOwner {
        _deploySrcWithSignature(immutables, order, signature, amount);
    }
    
    function deploySrcCompact(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount
    ) external payable onlyOwner {
        // Update immutables with deployment timestamp
        IBaseEscrow.Immutables memory immutablesMem = immutables;
        immutablesMem.timelocks = immutablesMem.timelocks.setDeployedAt(block.timestamp);
        
        // Calculate escrow address
        address escrowAddress = _FACTORY.addressOfEscrowSrc(immutablesMem);
        require(escrowAddress != address(0), "Invalid escrow address");

        // Send safety deposit to escrow address
        (bool success,) = escrowAddress.call{value: msg.value}("");
        if (!success) revert TransferFailed();

        // Set TakerTraits with target flag (bit 251)
        IOrderMixin.TakerTraits takerTraits = IOrderMixin.TakerTraits.wrap(uint256(1 << 251));
        
        // Encode escrow address as target in args
        bytes memory args = abi.encodePacked(escrowAddress);
        
        // Fill the order, which will transfer tokens to escrow
        _LOP.fillOrderArgs(order, r, vs, amount, takerTraits, args);

        emit SrcEscrowDeployed(escrowAddress, immutables.orderHash);
    }
    
    function _deploySrcWithSignature(
        IBaseEscrow.Immutables calldata immutables,
        IOrderMixin.Order calldata order,
        bytes calldata signature,
        uint256 amount
    ) internal {
        require(signature.length == 64 || signature.length == 65, "Invalid signature length");
        
        // Extract r and vs from signature
        bytes32 r;
        bytes32 vs;
        
        if (signature.length == 65) {
            // Standard signature format (r, s, v)
            uint8 v;
            bytes32 s;
            r = bytes32(signature[0:32]);
            s = bytes32(signature[32:64]);
            v = uint8(signature[64]);
            // Convert to compact format
            vs = bytes32(uint256(v - 27) << 255 | uint256(s >> 1));
        } else {
            // Compact format (r, vs)
            assembly {
                r := calldataload(add(signature.offset, 0))
                vs := calldataload(add(signature.offset, 32))
            }
        }

        // Update immutables with deployment timestamp
        IBaseEscrow.Immutables memory immutablesMem = immutables;
        immutablesMem.timelocks = immutablesMem.timelocks.setDeployedAt(block.timestamp);
        
        // Calculate escrow address
        address escrowAddress = _FACTORY.addressOfEscrowSrc(immutablesMem);
        require(escrowAddress != address(0), "Invalid escrow address");

        // Send safety deposit to escrow address
        (bool success,) = escrowAddress.call{value: msg.value}("");
        if (!success) revert TransferFailed();

        // Set TakerTraits with target flag (bit 251)
        IOrderMixin.TakerTraits takerTraits = IOrderMixin.TakerTraits.wrap(uint256(1 << 251));
        
        // Encode escrow address as target in args
        bytes memory args = abi.encodePacked(escrowAddress);
        
        // Fill the order, which will transfer tokens to escrow
        _LOP.fillOrderArgs(order, r, vs, amount, takerTraits, args);

        emit SrcEscrowDeployed(escrowAddress, immutables.orderHash);
    }

    function deployDst(
        IBaseEscrow.Immutables calldata immutables,
        uint256 srcCancellationTimestamp
    ) external payable onlyOwner {
        // Deploy destination escrow with safety deposit
        address escrowAddress = _FACTORY.createDstEscrow{value: msg.value}(immutables, srcCancellationTimestamp);
        
        // Transfer destination tokens to escrow
        address token = address(uint160(immutables.token));
        uint256 amount = immutables.amount;
        
        IERC20(token).safeTransferFrom(msg.sender, escrowAddress, amount);
        
        emit DstEscrowDeployed(escrowAddress, immutables.orderHash);
    }

    function withdraw(IEscrow escrow, bytes32 secret, IBaseEscrow.Immutables calldata immutables) external {
        escrow.withdraw(secret, immutables);
    }

    function cancel(IEscrow escrow, IBaseEscrow.Immutables calldata immutables) external {
        escrow.cancel(immutables);
    }

    function arbitraryCalls(address[] calldata targets, bytes[] calldata arguments) external onlyOwner {
        uint256 length = targets.length;
        if (targets.length != arguments.length) revert LengthMismatch();
        for (uint256 i = 0; i < length; ++i) {
            (bool success, bytes memory result) = targets[i].call(arguments[i]);
            if (!success) {
                // Forward the revert reason
                if (result.length > 0) {
                    assembly {
                        let size := mload(result)
                        revert(add(32, result), size)
                    }
                } else {
                    revert("Call failed");
                }
            }
        }
    }
}