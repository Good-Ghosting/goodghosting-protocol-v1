// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

abstract contract IRouter {
    function swapExactTokensForTokens(
        uint amountIn,
        uint amountOutMin,
        address[] calldata path,
        address to,
        uint deadline
    ) public virtual returns (uint[] memory amounts);
}
