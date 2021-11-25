pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./curve/ICurvePool.sol";
import "./curve/ICurveGauge.sol";

contract GoodGhostingPolygonCurve is Ownable, Pausable {
    using SafeMath for uint256;

    /// @notice total tokens in aave pool
    uint64 public constant NUM_AAVE_TOKENS = 3;
    /// @notice total tokens in atricrypto pool
    uint64 public constant NUM_ATRI_CRYPTO_TOKENS = 5;
    /// @notice identifies the "Aave Pool" Type
    uint64 public constant AAVE_POOL = 0;
    /// @notice identifies the "Atri Crypto Pool" Type
    uint64 public constant ATRI_CRYPTO_POOL = 1;
    /// @notice curve rewards per player
    uint256 public curveRewardsPerPlayer;
    /// @notice wmatic rewards per player
    uint256 public rewardsPerPlayer;
    /// @notice Stores the total amount of net interest received in the game.
    uint256 public totalGameInterest;
    /// @notice total principal amount
    uint256 public totalGamePrincipal;
    /// @notice performance fee amount allocated to the admin
    uint256 public adminFeeAmount;
    /// @notice total amount of incentive tokens to be distributed among winners
    uint256 public totalIncentiveAmount = 0;
    /// @notice Controls the amount of active players in the game (ignores players that early withdraw)
    uint256 public activePlayersCount = 0;
    /// @notice The amount to be paid on each segment
    uint256 public immutable segmentPayment;
    /// @notice The number of segments in the game (segment count)
    uint256 public immutable lastSegment;
    /// @notice When the game started (deployed timestamp)
    uint256 public immutable firstSegmentStart;
    /// @notice The time duration (in seconds) of each segment
    uint256 public immutable segmentLength;
    /// @notice The early withdrawal fee (percentage)
    uint128 public immutable earlyWithdrawalFee;
    /// @notice The performance admin fee (percentage)
    uint128 public immutable customFee;
    /// @notice Defines the max quantity of players allowed in the game
    uint256 public immutable maxPlayersCount;
    /// @notice winner counter to track no of winners
    uint256 public winnerCount = 0;
    /// @notice flag to differentiate between aave poll (0) and atricrypto pool (1)
    uint64 public immutable poolType;
    /// for some reason the curve contracts have int128 as param in the withdraw function
    /// hence the two types since type conversion is not possible
    /// @notice token index in the pool in int form. It's used for the Aave Pool
    /// @dev accepted values are: 0: DAI; 1: USDC; 2: USDT
    int128 inboundTokenIndexInt;
    /// @notice token index in the pool in uint form. It's used for the AtriCrypto Pool
    /// @dev accepted values are: 0: DAI; 1: USDC; 2: USDT; 3: WBTC; 4: WETH
    uint256 inboundTokenIndexUint;

    /// @notice controls if admin withdrew or not the performance fee.
    bool public adminWithdraw;
    /// @notice Controls if tokens were redeemed or not from the pool
    bool public redeemed;
    /// @notice Ownership Control flag
    bool public allowRenouncingOwnership = false;
    /// @notice pool address
    ICurvePool public pool;
    /// @notice curve lp token
    IERC20 public lpToken;
    /// @notice Address of the token used for depositing into the game by players (DAI)
    IERC20 public immutable daiToken;
    /// @notice Defines an optional token address used to provide additional incentives to users. Accepts "0x0" adresses when no incentive token exists.
    IERC20 public immutable incentiveToken;
    /// @notice gauge address
    ICurveGauge public immutable gauge;
    /// @notice curve token
    IERC20 public immutable curve;
    /// @notice wmatic token
    IERC20 public immutable matic;

    struct Player {
        bool withdrawn;
        bool canRejoin;
        bool isWinner;
        address addr;
        uint256 mostRecentSegmentPaid;
        uint256 amountPaid;
        uint256 winnerIndex;
    }
    /// @notice Stores info about the players in the game
    mapping(address => Player) public players;
    /// @notice controls the amount deposited in each segment that was not yet transferred to the external underlying pool
    /// @notice list of players
    address[] public iterablePlayers;
    /// @notice list of winners
    address[] public winners;

    event JoinedGame(address indexed player, uint256 amount);
    event Deposit(
        address indexed player,
        uint256 indexed segment,
        uint256 amount
    );
    event Withdrawal(
        address indexed player,
        uint256 amount,
        uint256 playerReward,
        uint256 playerCurveReward,
        uint256 playerIncentive
    );
    event FundsRedeemedFromExternalPool(
        uint256 totalAmount,
        uint256 totalGamePrincipal,
        uint256 totalGameInterest,
        uint256 rewards,
        uint256 curveRewards,
        uint256 totalIncentiveAmount
    );
    event WinnersAnnouncement(address[] winners);
    event EarlyWithdrawal(
        address indexed player,
        uint256 amount,
        uint256 totalGamePrincipal
    );

    event AdminWithdrawal(
        address indexed admin,
        uint256 totalGameInterest,
        uint256 adminFeeAmount,
        uint256 adminIncentiveAmount
    );

    modifier whenGameIsCompleted() {
        require(isGameCompleted(), "Game is not completed");
        _;
    }

    modifier whenGameIsNotCompleted() {
        require(!isGameCompleted(), "Game is already completed");
        _;
    }

        /**
        Creates a new instance of GoodGhosting game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _pool Smart contract address of the curve pool.
        @param _inboundTokenIndexInt token index in int form.
        @param _inboundTokenIndexUint token index in uint form.
        @param _poolType flag to differentiate between aave and atricrypto pool.
        @param _gauge Smart contract address of the cure poogauge to stake lp tokensl.
        @param _segmentCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment (i.e. 10*10**18 equals to 10 DAI - note that DAI uses 18 decimal places).
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
        @param _customFee performance fee charged by admin. Used as an integer percentage (i.e., 10 represents 10%). Does not accept "decimal" fees like "0.5".
        @param _maxPlayersCount max quantity of players allowed to join the game
        @param _curve Smart contract address of curve token
        @param _matic Smart contract address of wmatic token.
        @param _incentiveToken optional token address used to provide additional incentives to users. Accepts "0x0" adresses when no incentive token exists.
     */
    constructor(
        IERC20 _inboundCurrency,
        ICurvePool _pool,
        int128 _inboundTokenIndexInt,
        uint256 _inboundTokenIndexUint,
        uint64 _poolType,
        ICurveGauge _gauge,
        uint256 _segmentCount,
        uint256 _segmentLength,
        uint256 _segmentPayment,
        uint128 _earlyWithdrawalFee,
        uint128 _customFee,
        uint256 _maxPlayersCount,
        IERC20 _curve,
        IERC20 _matic,
        IERC20 _incentiveToken
    ) public {
        require(
            _customFee <= 20,
            "_customFee must be less than or equal to 20%"
        );
        require(
            _earlyWithdrawalFee <= 10,
            "_earlyWithdrawalFee must be less than or equal to 10%"
        );
        require(
            _earlyWithdrawalFee > 0,
            "_earlyWithdrawalFee must be greater than zero"
        );
        require(
            _maxPlayersCount > 0,
            "_maxPlayersCount must be greater than zero"
        );
        require(
            address(_inboundCurrency) != address(0),
            "invalid _inboundCurrency address"
        );
        require(_segmentCount > 0, "_segmentCount must be greater than zero");
        require(_segmentLength > 0, "_segmentLength must be greater than zero");
        require(
            _segmentPayment > 0,
            "_segmentPayment must be greater than zero"
        );
        require(address(_pool) != address(0), "invalid _pool address");
        require(address(_gauge) != address(0), "invalid _gauge address");
        require(address(_curve) != address(0), "invalid _curve address");
        require(address(_matic) != address(0), "invalid _matic address");
        require(
            _poolType >= AAVE_POOL && _poolType <= ATRI_CRYPTO_POOL,
            "invalid _poolType value"
        );

        // Aave Pool uses inboundTokenIndexInt
        // AtriCrypto pool uses inboundTokenIndexUInt
        if (_poolType == AAVE_POOL) {
            require(
                _inboundTokenIndexInt >= 0 && _inboundTokenIndexInt < NUM_AAVE_TOKENS,
                "invalid _inboundTokenIndexInt value"
            );
        } else {
            require(
                _inboundTokenIndexUint >= 0 && _inboundTokenIndexUint < NUM_ATRI_CRYPTO_TOKENS,
                "invalid _inboundTokenIndexUint value"
            );
        }

        // Initializes default variables
        pool = _pool;
        gauge = _gauge;
        curve = _curve;
        matic = _matic;
        inboundTokenIndexInt = _inboundTokenIndexInt;
        inboundTokenIndexUint = _inboundTokenIndexUint;
        poolType = _poolType;
        firstSegmentStart = block.timestamp; //gets current time
        lastSegment = _segmentCount;
        segmentLength = _segmentLength;
        segmentPayment = _segmentPayment;
        earlyWithdrawalFee = _earlyWithdrawalFee;
        customFee = _customFee;
        daiToken = _inboundCurrency;
        maxPlayersCount = _maxPlayersCount;
        incentiveToken = _incentiveToken;
        if (_poolType == AAVE_POOL) {
            lpToken = IERC20(pool.lp_token());
        } else if (_poolType == ATRI_CRYPTO_POOL) {
            lpToken = IERC20(pool.token());
        }
    }

    /// @notice pauses the game. This function can be called only by the contract's admin.
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /// @notice unpauses the game. This function can be called only by the contract's admin.
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    /// @notice Allows the admin to withdraw the performance fee, if applicable. This function can be called only by the contract's admin.
    /// @dev Cannot be called before the game ends.
    function adminFeeWithdraw() external onlyOwner whenGameIsCompleted {
        require(redeemed, "Funds not redeemed from external pool");
        require(!adminWithdraw, "Admin has already withdrawn");
        adminWithdraw = true;

        // when there are no winners, admin will be able to withdraw the
        // additional incentives sent to the pool, avoiding locking the funds.
        uint256 adminIncentiveAmount = 0;
        if (winnerCount == 0 && totalIncentiveAmount > 0) {
            adminIncentiveAmount = totalIncentiveAmount;
        }

        emit AdminWithdrawal(
            owner(),
            totalGameInterest,
            adminFeeAmount,
            adminIncentiveAmount
        );

        if (adminFeeAmount > 0) {
            require(
                IERC20(daiToken).transfer(owner(), adminFeeAmount),
                "Fail to transfer ER20 tokens to admin"
            );
        }

        if (adminIncentiveAmount > 0) {
            require(
                IERC20(incentiveToken).transfer(owner(), adminIncentiveAmount),
                "Fail to transfer ER20 incentive tokens to admin"
            );
        }

        if (rewardsPerPlayer == 0) {
            uint256 balance = IERC20(matic).balanceOf(address(this));
            require(
                IERC20(matic).transfer(owner(), balance),
                "Fail to transfer ERC20 rewards tokens one to admin"
            );
        }

        if (curveRewardsPerPlayer == 0) {
            uint256 balance = IERC20(curve).balanceOf(address(this));
            require(
                IERC20(curve).transfer(owner(), balance),
                "Fail to transfer ERC20 rewards tokens two to admin"
            );
        }
    }


    /// @notice Allows a player to join the game
    /// @param _minAmount Minimum amount accepted for withdrawal, to consider potential slippage in the pool.
    function joinGame(uint256 _minAmount) external virtual whenNotPaused {
        _joinGame(_minAmount);
    }

    /// @notice Allows a player to withdraws funds before the game ends. An early withdrawl fee is charged.
    /// @dev Cannot be called after the game is completed.
    /// @param _minAmount Minimum amount accepted for withdrawal, to consider potential slippage in the pool.
    function earlyWithdraw(uint256 _minAmount)
        external
        whenNotPaused
        whenGameIsNotCompleted
    {
        Player storage player = players[msg.sender];
        require(player.amountPaid > 0, "Player does not exist");
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;
        activePlayersCount = activePlayersCount.sub(1);
        if (winnerCount > 0 && player.isWinner) {
            winnerCount = winnerCount.sub(uint256(1));
            player.isWinner = false;
            winners[player.winnerIndex] = address(0);
        }

        // In an early withdraw, users get their principal minus the earlyWithdrawalFee % defined in the constructor.
        uint256 withdrawAmount = player.amountPaid.sub(
            player.amountPaid.mul(earlyWithdrawalFee).div(100)
        );
        // Decreases the totalGamePrincipal on earlyWithdraw
        totalGamePrincipal = totalGamePrincipal.sub(player.amountPaid);
        uint256 currentSegment = getCurrentSegment();

        // Users that early withdraw during the first segment, are allowed to rejoin.
        if (currentSegment == 0) {
            player.canRejoin = true;
        }

        emit EarlyWithdrawal(msg.sender, withdrawAmount, totalGamePrincipal);
        /*
        Code of curve's aave and curve's atricrypto pools are completely different.
        Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
        Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
            and funds sit in those pools. Hence, an approval transaction is required because
            it is communicating with external contracts
        Constants "NUM_AAVE_TOKENS" and "NUM_ATRI_CRYPTO_TOKENS" have to be a constant type actually,
            otherwise the signature becomes different and the external call will fail.
            If we use an "if" condition based on pool type, and dynamically set
            a value for these variables, the assignment will be to a non-constant
            which will result in failure. This is due to the structure of how
            the curve contracts are written
        */
        if (poolType == AAVE_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts;
            for (uint256 i = 0; i < NUM_AAVE_TOKENS; i++) {
                if (i == uint256(inboundTokenIndexInt)) {
                    amounts[i] = withdrawAmount;
                } else {
                    amounts[i] = 0;
                }
            }
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            if (gauge.balanceOf(address(this)) < poolWithdrawAmount) {
                poolWithdrawAmount = gauge.balanceOf(address(this));
            }

            gauge.withdraw(poolWithdrawAmount, false);

            pool.remove_liquidity_one_coin(
                poolWithdrawAmount,
                inboundTokenIndexInt,
                _minAmount,
                true
            );
        } else if (poolType == ATRI_CRYPTO_POOL) {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts;
            for (uint256 i = 0; i < NUM_ATRI_CRYPTO_TOKENS; i++) {
                if (i == inboundTokenIndexUint) {
                    amounts[i] = withdrawAmount;
                } else {
                    amounts[i] = 0;
                }
            }
            uint256 poolWithdrawAmount = pool.calc_token_amount(amounts, true);

            if (gauge.balanceOf(address(this)) < poolWithdrawAmount) {
                poolWithdrawAmount = gauge.balanceOf(address(this));
            }

            gauge.withdraw(poolWithdrawAmount, false);

            require(
                lpToken.approve(address(pool), poolWithdrawAmount),
                "Fail to approve allowance to pool"
            );
            pool.remove_liquidity_one_coin(
                poolWithdrawAmount,
                inboundTokenIndexUint,
                _minAmount
            );
        }

        if (daiToken.balanceOf(address(this)) < withdrawAmount) {
            withdrawAmount = daiToken.balanceOf(address(this));
        }
 
        require(
            IERC20(daiToken).transfer(msg.sender, withdrawAmount),
            "Fail to transfer ERC20 tokens on early withdraw"
        );
    }

    /// @notice Allows player to withdraw their funds after the game ends with no loss (fee). Winners get a share of the interest earned.
    /// @param _minAmount Minimum amount accepted for withdrawal, to consider potential slippage in the pool.
    function withdraw(uint256 _minAmount) external {
        Player storage player = players[msg.sender];
        require(player.amountPaid > 0, "Player does not exist");
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;

        // First player to withdraw redeems everyone's funds
        if (!redeemed) {
            redeemFromExternalPool(_minAmount);
        }

        uint256 payout = player.amountPaid;
        uint256 playerIncentive = 0;
        uint256 playerReward = 0;
        uint256 playerCurveReward = 0;
        if (player.mostRecentSegmentPaid == lastSegment.sub(1)) {
            // Player is a winner and gets a bonus!
            payout = payout.add(totalGameInterest.div(winnerCount));
            playerReward = rewardsPerPlayer;
            playerCurveReward = curveRewardsPerPlayer;
            // If there's additional incentives, distributes them to winners
            if (totalIncentiveAmount > 0) {
                playerIncentive = totalIncentiveAmount.div(winnerCount);
            }
        }
        emit Withdrawal(
            msg.sender,
            payout,
            playerReward,
            playerCurveReward,
            playerIncentive
        );

        require(
            IERC20(daiToken).transfer(msg.sender, payout),
            "Fail to transfer ERC20 tokens on withdraw"
        );

        if (playerIncentive > 0) {
            require(
                IERC20(incentiveToken).transfer(msg.sender, playerIncentive),
                "Fail to transfer ERC20 incentive tokens on withdraw"
            );
        }

        if (playerReward > 0) {
            require(
                IERC20(matic).transfer(msg.sender, playerReward),
                "Fail to transfer ERC20 rewards one on withdraw"
            );
        }

        if (playerCurveReward > 0) {
            require(
                IERC20(curve).transfer(msg.sender, playerCurveReward),
                "Fail to transfer ERC20 rewards two on withdraw"
            );
        }
    }

    /// @notice Allows players to make deposits for the game segments, after joining the game.
    /// @param _minAmount Minimum amount accepted for withdrawal, to consider potential slippage in the pool.
    function makeDeposit(uint256 _minAmount) external whenNotPaused {
        Player storage player = players[msg.sender];
        require(!player.withdrawn, "Player already withdraw from game");
        // only registered players can deposit
        require(player.addr == msg.sender, "Sender is not a player");

        uint256 currentSegment = getCurrentSegment();
        // User can only deposit between segment 1 and segment n-1 (where n is the number of segments for the game).
        // Details:
        // Segment 0 is paid when user joins the game (the first deposit window).
        // Last segment doesn't accept payments, because the payment window for the last
        // segment happens on segment n-1 (penultimate segment).
        // Any segment greater than the last segment means the game is completed, and cannot
        // receive payments
        require(
            currentSegment > 0 && currentSegment < lastSegment,
            "Deposit available only between segment 1 and segment n-1 (penultimate)"
        );

        //check if current segment is currently unpaid
        require(
            player.mostRecentSegmentPaid != currentSegment,
            "Player already paid current segment"
        );

        // check if player has made payments up to the previous segment
        require(
            player.mostRecentSegmentPaid == currentSegment.sub(1),
            "Player didn't pay the previous segment - game over!"
        );

        emit Deposit(msg.sender, currentSegment, segmentPayment);
        _transferDaiToContract(_minAmount);
    }

    /// @notice Unlocks renounceOwnership.
    function unlockRenounceOwnership() external onlyOwner {
        allowRenouncingOwnership = true;
    }

    /// @notice gets the number of players in the game
    /// @return number of players
    function getNumberOfPlayers() external view returns (uint256) {
        return iterablePlayers.length;
    }

    /// @notice Renounces Ownership.
    function renounceOwnership() public override onlyOwner {
        require(allowRenouncingOwnership, "Not allowed");
        super.renounceOwnership();
    }

    /// @notice Redeems funds from the external pool and updates the internal accounting controls related to the game stats.
    /// @dev Can only be called after the game is completed.
    /// @param _minAmount Minimum amount accepted for withdrawal, to consider potential slippage in the pool.
    function redeemFromExternalPool(uint256 _minAmount)
        public
        whenGameIsCompleted
    {
        require(!redeemed, "Redeem operation already happened for the game");
        redeemed = true;
        uint256 lpBalance = gauge.balanceOf(address(this));
        gauge.withdraw(lpBalance, true);

        /*
        Code of curve's aave and curve's atricrypto pools are completely different.
        Curve's Aave Pool (pool type 0): in this contract, all funds "sit" in the pool's smart contract.
        Curve's Atricrypto pool (pool type 1): this contract integrates with other pools
            and funds sit in those pools. Hence, an approval transaction is required because
            it is communicating with external contracts
        Constants "NUM_AAVE_TOKENS" and "NUM_ATRI_CRYPTO_TOKENS" have to be a constant type actually,
            otherwise the signature becomes different and the external call will fail.
            If we use an "if" condition based on pool type, and dynamically set
            a value for these variables, the assignment will be to a non-constant
            which will result in failure. This is due to the structure of how
            the curve contracts are written
        */
        if (poolType == AAVE_POOL) {
            pool.remove_liquidity_one_coin(
                lpToken.balanceOf(address(this)),
                inboundTokenIndexInt,
                _minAmount,
                true
            );
        } else if (poolType == ATRI_CRYPTO_POOL) {
            require(
                lpToken.approve(
                    address(pool),
                    lpToken.balanceOf(address(this))
                ),
                "Fail to approve allowance to pool"
            );

            pool.remove_liquidity_one_coin(
                lpToken.balanceOf(address(this)),
                inboundTokenIndexUint,
                _minAmount
            );
        }

        uint256 totalBalance = IERC20(daiToken).balanceOf(address(this));
        uint256 rewardsAmount = IERC20(matic).balanceOf(address(this));
        uint256 curveRewardAmount = IERC20(curve).balanceOf(address(this));
        // If there's an incentive token address defined, sets the total incentive amount to be distributed among winners.
        if (address(incentiveToken) != address(0)) {
            totalIncentiveAmount = IERC20(incentiveToken).balanceOf(
                address(this)
            );
        }
        // calculates gross interest
        uint256 grossInterest = 0;
        // Sanity check to avoid reverting due to overflow in the "subtraction" below.
        // This could only happen in case Aave changes the 1:1 ratio between
        // aToken vs. Token in the future (i.e., 1 aDAI is worth less than 1 DAI)
        if (totalBalance > totalGamePrincipal) {
            grossInterest = totalBalance.sub(totalGamePrincipal);
        }
        // calculates the performance/admin fee (takes a cut - the admin percentage fee - from the pool's interest).
        // calculates the "gameInterest" (net interest) that will be split among winners in the game
        uint256 _adminFeeAmount;
        if (customFee > 0) {
            _adminFeeAmount = (grossInterest.mul(customFee)).div(100);
            totalGameInterest = grossInterest.sub(_adminFeeAmount);
        } else {
            _adminFeeAmount = 0;
            totalGameInterest = grossInterest;
        }

        // when there's no winners, admin takes all the interest + rewards
        if (winnerCount == 0) {
            rewardsPerPlayer = 0;
            curveRewardsPerPlayer = 0;
            adminFeeAmount = grossInterest;
        } else {
            rewardsPerPlayer = rewardsAmount.div(winnerCount);
            curveRewardsPerPlayer = curveRewardAmount.div(winnerCount);
            adminFeeAmount = _adminFeeAmount;
        }

        emit FundsRedeemedFromExternalPool(
            totalBalance,
            totalGamePrincipal,
            totalGameInterest,
            rewardsAmount,
            curveRewardAmount,
            totalIncentiveAmount
        );
        emit WinnersAnnouncement(winners);
    }

    /// @notice Calculates the current segment of the game.
    /// @return current game segment
    function getCurrentSegment() public view returns (uint256) {
        return block.timestamp.sub(firstSegmentStart).div(segmentLength);
    }

    /// @notice Checks if the game is completed or not.
    /// @return "true" if completeted; otherwise, "false".
    function isGameCompleted() public view returns (bool) {
        // Game is completed when the current segment is greater than "lastSegment" of the game.
        return getCurrentSegment() > lastSegment;
    }

    /**
        @dev Manages the transfer of funds from the player to the contract, recording
        the required accounting operations to control the user's position in the pool.
        @param _minAmount Minimum amount accepted for withdrawal, to consider potential slippage in the pool.
     */
    function _transferDaiToContract(uint256 _minAmount) internal {
        require(
            daiToken.allowance(msg.sender, address(this)) >= segmentPayment,
            "You need to have allowance to do transfer DAI on the smart contract"
        );

        uint256 currentSegment = getCurrentSegment();
        players[msg.sender].mostRecentSegmentPaid = currentSegment;
        players[msg.sender].amountPaid = players[msg.sender].amountPaid.add(
            segmentPayment
        );
        // check if this is deposit for the last segment. If yes, the player is a winner.
        // since both join game and deposit method call this method so having it here
        if (currentSegment == lastSegment.sub(1)) {
            winners.push(msg.sender);
            // array indexes start from 0
            players[msg.sender].winnerIndex = winners.length.sub(uint256(1));
            winnerCount = winnerCount.add(uint256(1));
            players[msg.sender].isWinner = true;
        }

        totalGamePrincipal = totalGamePrincipal.add(segmentPayment);
        require(
            daiToken.transferFrom(msg.sender, address(this), segmentPayment),
            "Transfer failed"
        );

        // Allows the lending pool to convert DAI deposited on this contract to aDAI on lending pool
        uint256 contractBalance = daiToken.balanceOf(address(this));
        require(
            daiToken.approve(address(pool), contractBalance),
            "Fail to approve allowance to pool"
        );

        /*
        Constants "NUM_AAVE_TOKENS" and "NUM_ATRI_CRYPTO_TOKENS" have to be a constant type actually,
            otherwise the signature becomes different and the external call will fail.
            If we use an "if" condition based on pool type, and dynamically set
            a value for these variables, the assignment will be to a non-constant
            which will result in failure. This is due to the structure of how
            the curve contracts are written
        */
        if (poolType == AAVE_POOL) {
            uint256[NUM_AAVE_TOKENS] memory amounts;
            for (uint256 i = 0; i < NUM_AAVE_TOKENS; i++) {
                if (i == uint256(inboundTokenIndexInt)) {
                    amounts[i] = segmentPayment;
                } else {
                    amounts[i] = 0;
                }
            }
            pool.add_liquidity(amounts, _minAmount, true);
        } else if (poolType == ATRI_CRYPTO_POOL) {
            uint256[NUM_ATRI_CRYPTO_TOKENS] memory amounts;
            for (uint256 i = 0; i < NUM_ATRI_CRYPTO_TOKENS; i++) {
                if (i == inboundTokenIndexUint) {
                    amounts[i] = segmentPayment;
                } else {
                    amounts[i] = 0;
                }
            }
            pool.add_liquidity(amounts, _minAmount);
        }

        require(
            lpToken.approve(address(gauge), lpToken.balanceOf(address(this))),
            "Fail to approve allowance to gauge"
        );
        gauge.deposit(lpToken.balanceOf(address(this)));
    }

    /// @notice Allows a player to join the game and controls
    /// @param _minAmount Minimum amount accepted for withdrawal, to consider potential slippage in the pool.
    function _joinGame(uint256 _minAmount) internal {
        require(getCurrentSegment() == 0, "Game has already started");
        require(
            players[msg.sender].addr != msg.sender ||
                players[msg.sender].canRejoin,
            "Cannot join the game more than once"
        );

        activePlayersCount = activePlayersCount.add(1);
        require(
            activePlayersCount <= maxPlayersCount,
            "Reached max quantity of players allowed"
        );

        bool canRejoin = players[msg.sender].canRejoin;
        Player memory newPlayer = Player({
            addr: msg.sender,
            mostRecentSegmentPaid: 0,
            amountPaid: 0,
            withdrawn: false,
            canRejoin: false,
            isWinner: false,
            winnerIndex: 0
        });
        players[msg.sender] = newPlayer;
        if (!canRejoin) {
            iterablePlayers.push(msg.sender);
        }
        emit JoinedGame(msg.sender, segmentPayment);
        _transferDaiToContract(_minAmount);
    }
}
