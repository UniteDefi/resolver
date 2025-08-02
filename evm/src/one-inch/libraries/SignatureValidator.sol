// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

library SignatureValidator {
    using ECDSA for bytes32;

    function recoverSigner(
        bytes32 hash,
        bytes memory signature
    ) internal pure returns (address) {
        return hash.recover(signature);
    }

    function isValidSignature(
        bytes32 hash,
        bytes memory signature,
        address expectedSigner
    ) internal pure returns (bool) {
        address recoveredSigner = recoverSigner(hash, signature);
        return recoveredSigner == expectedSigner;
    }
}