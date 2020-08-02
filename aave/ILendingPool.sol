// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.0;

abstract contract ILendingPool {
    function deposit(address _reserve, uint256 _amount, uint16 _referralCode) public virtual;
    //see: https://github.com/aave/aave-protocol/blob/1ff8418eb5c73ce233ac44bfb7541d07828b273f/contracts/tokenization/AToken.sol#L218
    function redeem(uint256 _amount) public virtual;
}
