pragma solidity 0.6.11;

interface IWETHGateway {
    function depositETH(
        address lendingPool,
        address onBehalfOf,
        uint16 referralCode
    ) external payable;

    //see: https://github.com/aave/aave-protocol/blob/1ff8418eb5c73ce233ac44bfb7541d07828b273f/contracts/tokenization/AToken.sol#L218
    function withdrawETH(
        address lendingPool,
        uint256 amount,
        address to
    ) external;
}
