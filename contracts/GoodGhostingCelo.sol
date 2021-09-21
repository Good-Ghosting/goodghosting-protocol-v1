// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

import "./GoodGhosting.sol";

/// @title GoodGhosting Game Contract
/// @notice Used for games deployed on Ethereum Mainnet, using Aave as the underlying pool
/// @author Francis Odisi & Viraz Malhotra
contract GoodGhostingCelo is GoodGhosting {

    /**
        Creates a new instance of GoodGhosting game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _lendingPoolAddressProvider Smart contract address of the lending pool adddress provider.
        @param _segmentCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment (i.e. 10*10**18 equals to 10 DAI - note that DAI uses 18 decimal places).
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
        @param _customFee performance fee charged  by admin. Used as an integer percentage (i.e., 10 represents 10%). Does not accept "decimal" fees like "0.5".
        @param _dataProvider address of the data provider
        @param _maxPlayersCount max quantity of players allowed to join the game
        @param _incentiveToken optional token address used to provide additional incentives to users. Accepts "0x0" adresses when no incentive token exists.
     */
    constructor(
        IERC20 _inboundCurrency,
        ILendingPoolAddressesProvider _lendingPoolAddressProvider,
        uint256 _segmentCount,
        uint256 _segmentLength,
        uint256 _segmentPayment,
        uint256 _earlyWithdrawalFee,
        uint256 _customFee,
        address _dataProvider,
        uint256 _maxPlayersCount,
        IERC20 _incentiveToken
    ) public GoodGhosting(
        _inboundCurrency, 
        _lendingPoolAddressProvider,
        _segmentCount,
        _segmentLength,
        _segmentPayment,
        _earlyWithdrawalFee,
        _customFee,
        _dataProvider,
        _maxPlayersCount,
        _incentiveToken
    ) {}
}
