// SPDX-License-Identifier: MIT
pragma solidity 0.8.23;

interface IOrderMixin {
    struct Order {
        uint256 salt;
        address maker;
        address receiver;
        address makerAsset;
        address takerAsset;
        uint256 makingAmount;
        uint256 takingAmount;
        uint256 deadline;
        uint256 nonce;
        uint256 srcChainId;
        uint256 dstChainId;
        uint256 auctionStartTime;
        uint256 auctionEndTime;
        uint256 startPrice;
        uint256 endPrice;
    }

    // TakerTraits is a uint256 that encodes various flags
    type TakerTraits is uint256;

    function fillOrderArgs(
        Order calldata order,
        bytes32 r,
        bytes32 vs,
        uint256 amount,
        TakerTraits takerTraits,
        bytes calldata args
    ) external payable returns (uint256 makingAmount, uint256 takingAmount, bytes32 orderHash);
    
    // Partial fill support functions
    function getFilledAmount(bytes32 orderHash) external view returns (uint256);
    function getEscrowAddress(bytes32 orderHash) external view returns (address);
    function isOrderFullyFilled(bytes32 orderHash) external view returns (bool);
    function getRemainingAmountByOrder(Order memory order) external view returns (uint256);
    function updateFillAmount(Order calldata order, uint256 fillAmount) external;
}