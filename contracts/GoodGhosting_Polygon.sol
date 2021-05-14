// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./aave/ILendingPoolAddressesProvider.sol";
import "./aave/ILendingPool.sol";
import "./aave/AToken.sol";
import "./aave/IncentiveController.sol";
import "./GoodGhostingWhitelisted.sol";
import "./GoodGhosting.sol";

/**
 * Play the save game.
 *
 */

contract GoodGhostingPolygon is GoodGhosting {
    IncentiveController public incentiveController;
    IERC20 public immutable matic;
    uint public rewardsPerPlayer;

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
        @param _matic matic token address.
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
        IERC20 _matic
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
    }

    /**
       Allowing the admin to withdraw the pool fees
    */
    function adminFeeWithdraw() external override  onlyOwner whenGameIsCompleted {
        require(!adminWithdraw, "Admin has already withdrawn");
        require(adminFeeAmount > 0, "No Fees Earned");
        adminWithdraw = true;
        emit AdminWithdrawal(owner(), totalGameInterest, adminFeeAmount);
        require(
            IERC20(daiToken).transfer(owner(), adminFeeAmount),
            "Fail to transfer ER20 tokens to admin"
        );
        if (rewardsPerPlayer == 0) {
        uint balance = IERC20(matic).balanceOf(address(this));
        require(
            IERC20(matic).transfer(msg.sender, balance),
            "Fail to transfer ERC20 tokens on withdraw"
        );
        }
    }

    // to be called by individual players to get the amount back once it is redeemed following the solidity withdraw pattern
    function withdraw() public override {
        Player storage player = players[msg.sender];
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;

        uint256 payout = player.amountPaid;
        if (player.mostRecentSegmentPaid == lastSegment.sub(1)) {
            // Player is a winner and gets a bonus!
            // No need to worry about if winners.length = 0
            // If we're in this block then the user is a winner
            payout = payout.add(totalGameInterest.div(winners.length));
        }
        emit Withdrawal(msg.sender, payout);

        // First player to withdraw redeems everyone's funds
        if (!redeemed) {
            redeemFromExternalPool();
        }

        require(
            IERC20(daiToken).transfer(msg.sender, payout),
            "Fail to transfer ERC20 tokens on withdraw"
        );
        // doing the transfer in the end as per the checks and effects pattern
        if (player.mostRecentSegmentPaid == lastSegment.sub(1)) {
        if (rewardsPerPlayer > 0) {
        require(
            IERC20(matic).transfer(msg.sender, rewardsPerPlayer),
            "Fail to transfer ERC20 tokens on withdraw"
        );
        }
        }
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
        uint256 amount;
        if (adaiToken.balanceOf(address(this)) > 0) {
            lendingPool.withdraw(
                address(daiToken),
                type(uint256).max,
                address(this)
            );
            address[] memory assets = new address[](1);
            assets[0] = address(adaiToken);
            amount = incentiveController.getRewardsBalance(
                assets,
                address(this)
            );
            if (amount > 0) {
                amount = incentiveController.claimRewards(
                    assets,
                    amount,
                    address(this)
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
            rewardsPerPlayer = 0;
            adminFeeAmount = grossInterest;
        } else {
            rewardsPerPlayer = amount.div(winners.length);
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
