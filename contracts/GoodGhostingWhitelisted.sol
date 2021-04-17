// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.6.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/cryptography/MerkleProof.sol";
import "./merkel/IMerkleDistributor.sol";

contract GoodGhostingWhitelisted is IMerkleDistributor {
    bytes32 public immutable override merkleRoot;

    constructor(bytes32 merkleRoot_) public {
        merkleRoot = merkleRoot_;
    }

    function claim(uint256 index, address account, bool isValid, bytes32[] calldata merkleProof) public view override {
        // Verify the merkle proof.
        bytes32 node = keccak256(abi.encodePacked(index, account, isValid));
        require(MerkleProof.verify(merkleProof, merkleRoot, node), 'MerkleDistributor: Invalid proof');
    }
}
