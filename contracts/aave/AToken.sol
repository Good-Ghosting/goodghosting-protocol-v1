// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.0;

interface AToken {
    function redeem(uint256 _amount) external;

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);
}