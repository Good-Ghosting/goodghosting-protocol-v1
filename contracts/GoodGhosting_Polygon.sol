// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./aave/ILendingPoolAddressesProvider.sol";
import "./aave/ILendingPool.sol";
import "./aave/AToken.sol";
import "./aave/IncentiveController.sol";
import "./quickswap/IRouter.sol";
import "./GoodGhostingWhitelisted.sol";
import "./GoodGhosting.sol";

/**
 * Play the save game.
 *
 */

contract GoodGhosting_Polygon is GoodGhosting {
    IncentiveController public incentiveController;
    IRouter public router;
    IERC20 public immutable matic;
    IERC20 public immutable quick;

    /**
        Creates a new instance of GoodGhosting game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _lendingPoolAddressProvider Smart contract address of the lending pool adddress provider.
        @param _segmentCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment (i.e. 10*10**18 equals to 10 DAI - note that DAI uses 18 decimal places).
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
        customFee
        @param _dataProvider id for getting the data provider contract address 0x1 to be passed.
        @param merkleRoot_ merkel root to verify players on chain to allow only whitelisted users join.
        @param _incentiveController $matic reward claim contract.
        @param _router quickswap router address.
        @param _matic matic token address.
        @param _quick quick token address.
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
        bytes32 merkleRoot_,
        address _incentiveController,
        IRouter _router,
        IERC20 _matic,
        IERC20 _quick
    )
        public
        GoodGhosting(
            _inboundCurrency,
            _lendingPoolAddressProvider,
            _segmentCount,
            _segmentLength,
            _segmentPayment,
            _earlyWithdrawalFee,
            _customFee,
            _dataProvider,
            merkleRoot_
        )
    {
        // initializing incentiveController contract
        incentiveController = IncentiveController(_incentiveController);
        matic = _matic;
        quick = _quick;
        router = _router;
    }

    /**
        Reedems funds from external pool and calculates total amount of interest for the game.
        @dev This method only redeems funds from the external pool, without doing any allocation of balances
             to users. This helps to prevent running out of gas and having funds locked into the external pool.
    */
    function redeemFromExternalPool() public override whenGameIsCompleted {
        require(!redeemed, "Redeem operation already happened for the game");
        redeemed = true;
        // aave has 1:1 peg for tokens and atokens
        // there is no redeem function in v2 it is replaced by withdraw in v2
        // Aave docs recommends using uint(-1) to withdraw the full balance. This is actually an overflow that results in the max uint256 value.
        if (adaiToken.balanceOf(address(this)) > 0) {
            lendingPool.withdraw(
                address(daiToken),
                type(uint256).max,
                address(this)
            );
            address[] memory assets = new address[](1);
            assets[0] = address(adaiToken);
            uint256 amount = incentiveController.getRewardsBalance(
                assets,
                address(this)
            );
            if (amount > 0) {
                amount = incentiveController.claimRewards(
                    assets,
                    amount,
                    address(this),
                    false
                );
                address[] memory pairTokens = new address[](3);
                pairTokens[0] = address(matic);
                pairTokens[1] = address(quick);
                pairTokens[2] = address(daiToken);
                router.swapExactTokensForTokens(
                    amount,
                    0,
                    pairTokens,
                    address(this),
                    now.add(1200)
                );
            }
        }

        uint256 totalBalance = IERC20(daiToken).balanceOf(address(this));
        // recording principal amount separately since adai balance will have interest has well
        uint256 grossInterest = totalBalance.sub(totalGamePrincipal);
        // deduction of a fee % usually 1 % as part of pool fees.
        uint256 _adminFeeAmount;
        if (customFee > 0) {
            _adminFeeAmount = (grossInterest.mul(customFee)).div(100);
            totalGameInterest = grossInterest.sub(_adminFeeAmount);
        } else {
            _adminFeeAmount = 0;
            totalGameInterest = grossInterest;
        }

        if (winners.length == 0) {
            adminFeeAmount = grossInterest;
        } else {
            adminFeeAmount = _adminFeeAmount;
        }

        emit FundsRedeemedFromExternalPool(
            totalBalance,
            totalGamePrincipal,
            totalGameInterest
        );
        emit WinnersAnnouncement(winners);
    }
}
