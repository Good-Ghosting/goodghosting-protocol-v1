// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";

contract GoodGhostingRegistry is Ownable {
    event RegistryInitialized(address[] contracts);
    event RegistryUpdated(address contracts);

    mapping(address => bool) public pools;

    function isValid(address _contract) internal {
        require(_contract != address(0), "invalid _contract address");
    }

    constructor(address[] memory _contracts) public {
        for (uint i = 0; i < _contracts.length; i++) {
            isValid(_contracts[i]);
            pools[_contracts[i]] = true;
        }
        emit RegistryInitialized(_contracts);
    }

    function addContract(address _contract) external onlyOwner {
        isValid(_contract);
        pools[_contract] = true;
        emit RegistryUpdated(_contract);
    }
}