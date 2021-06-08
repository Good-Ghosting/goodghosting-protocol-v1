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

/// @title GoodGhosting Game Polygon Contract
/// @author Francis Odisi & Viraz Malhotra
contract GoodGhostingPolygon is GoodGhosting {
    IncentiveController public incentiveController;
    IERC20 public immutable matic;
    uint public rewardsPerPlayer;

    event Withdrawal(address indexed player, uint256 amount, uint256 playerReward);

    event FundsRedeemedFromExternalPool(
        uint256 totalAmount,
        uint256 totalGamePrincipal,
        uint256 totalGameInterest,
        uint256 rewards
    );

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

    /// @notice Allows admin to withdraw fees if applicable
    function adminFeeWithdraw() external override  onlyOwner whenGameIsCompleted {
        require(redeemed, "Funds not redeemed from external pool");
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

    /// @notice Allows all the players to withdraw the funds, winners get a share of interest and wmatic rewards
    function withdraw() external override {
        Player storage player = players[msg.sender];
        require(player.amountPaid > 0, "Player does not exist");
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;

        uint256 payout = player.amountPaid;
        uint256 playerReward = 0;
        if (player.mostRecentSegmentPaid == lastSegment.sub(1)) {
            // Player is a winner and gets a bonus!
            payout = payout.add(totalGameInterest.div(winners.length));
            playerReward = rewardsPerPlayer;
        }
        emit Withdrawal(msg.sender, payout, playerReward);

        // First player to withdraw redeems everyone's funds
        if (!redeemed) {
            redeemFromExternalPool();
        }

        require(
            IERC20(daiToken).transfer(msg.sender, payout),
            "Fail to transfer ERC20 tokens on withdraw"
        );

        if (playerReward > 0) {
            require(
                IERC20(matic).transfer(msg.sender, playerReward),
                "Fail to transfer ERC20 rewards on withdraw"
            );
        }
    }

    /// @notice Redeems Funds from the external aave pool
    function redeemFromExternalPool() public override whenGameIsCompleted {
        require(!redeemed, "Redeem operation already happened for the game");
        redeemed = true;
        uint256 amount = 0;
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
            totalGameInterest,
            amount
        );
        emit WinnersAnnouncement(winners);
    }
}
