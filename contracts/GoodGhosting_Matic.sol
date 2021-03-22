// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./quickswap/IRouter.sol";
import "./quickswap/IPair.sol";
import "./quickswap/IStake.sol";
import "./utils/Math.sol";
/**
 * Play the save game.
 *
 */

contract GoodGhostingMatic is Ownable, Pausable {
    using SafeMath for uint256;

    // Controls if tokens were redeemed or not from the pool
    bool public redeemed;
    // Stores the total amount of interest received in the game.
    uint256 public totalGameInterest;
    //  total principal amount
    uint256 public totalGamePrincipal;

    // Token that players use to buy in the game - DAI
    IERC20 public immutable mtoken;
    IERC20 public immutable matoken;
    IERC20 public immutable quick;

    // quickswap eouter instance
    IRouter public router;
    IPair public pair;
    IStake public stake;

    uint256 public immutable segmentPayment;
    uint256 public immutable lastSegment;
    uint256 public immutable firstSegmentStart;
    uint256 public immutable segmentLength;
    uint256 public immutable earlyWithdrawalFee;

    struct Player {
        address addr;
        bool withdrawn;
        uint256 mostRecentSegmentPaid;
        uint256 amountPaid;
    }
    mapping(address => Player) public players;
    // we need to differentiate the deposit amount to aave or any other protocol for each window hence this mapping segment no => total deposit amount for that
    mapping(uint256 => uint256) public segmentDeposit;
    address[] public iterablePlayers;
    address[] public winners;

    event JoinedGame(address indexed player, uint256 amount);
    event Deposit(
        address indexed player,
        uint256 indexed segment,
        uint256 amount
    );
    event Withdrawal(address indexed player, uint256 amount);
    event FundsDepositedIntoExternalPool(uint256 amount);
    event FundsRedeemedFromExternalPool(
        uint256 totalAmount,
        uint256 totalGamePrincipal,
        uint256 totalGameInterest
    );
    event WinnersAnnouncement(address[] winners);
    event EarlyWithdrawal(address indexed player, uint256 amount);

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
        @param _segmentCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment (i.e. 10*10**18 equals to 10 DAI - note that DAI uses 18 decimal places).
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
     */
    constructor(
        IERC20 _inboundCurrency,
        IERC20 _matoken,
        IERC20 _quick,
        IRouter _router,
        IPair _pair,
        IStake _stake,
        uint256 _segmentCount,
        uint256 _segmentLength,
        uint256 _segmentPayment,
        uint256 _earlyWithdrawalFee
    ) public {
        // Initializes default variables
        firstSegmentStart = block.timestamp; //gets current time
        lastSegment = _segmentCount;
        segmentLength = _segmentLength;
        segmentPayment = _segmentPayment;
        earlyWithdrawalFee = _earlyWithdrawalFee;
        mtoken = _inboundCurrency;
        matoken = _matoken;
        quick = _quick;
        router = _router;
        pair = _pair;
        stake = _stake;

        // Allows the lending pool to convert DAI deposited on this contract to aDAI on lending pool
        uint256 MAX_ALLOWANCE = 2**256 - 1;
        require(
            _inboundCurrency.approve(address(router), MAX_ALLOWANCE),
            "Fail to approve allowance to lending pool"
        );
        require(
            _matoken.approve(address(router), MAX_ALLOWANCE),
            "Fail to approve allowance to lending pool"
        );

        require(
            pair.approve(address(stake), MAX_ALLOWANCE),
            "Fail to approve allowance to lending pool"
        );
    }

    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    function _transferDaiToContract() internal {
        // users pays dai in to the smart contract, which he pre-approved to spend the DAI for him
        // convert DAI to aDAI using the lending pool
        // this doesn't make sense since we are already transferring
        require(
            mtoken.allowance(msg.sender, address(this)) >= segmentPayment,
            "You need to have allowance to do transfer DAI on the smart contract"
        );

        uint256 currentSegment = getCurrentSegment();

        players[msg.sender].mostRecentSegmentPaid = currentSegment;
        players[msg.sender].amountPaid = players[msg.sender].amountPaid.add(
            segmentPayment
        );
        totalGamePrincipal = totalGamePrincipal.add(segmentPayment);
        segmentDeposit[currentSegment] = segmentDeposit[currentSegment].add(
            segmentPayment
        );
        // SECURITY NOTE:
        // Interacting with the external contracts should be the last action in the logic to avoid re-entracy attacks.
        // Re-entrancy: https://solidity.readthedocs.io/en/v0.6.12/security-considerations.html#re-entrancy
        // Check-Effects-Interactions Pattern: https://solidity.readthedocs.io/en/v0.6.12/security-considerations.html#use-the-checks-effects-interactions-pattern
        require(
            mtoken.transferFrom(msg.sender, address(this), segmentPayment),
            "Transfer failed"
        );
    }
    /**
       Returns the LP Token amount based on the tokens deposited in the pool
       Logic Used => https://explorer-mainnet.maticvigil.com/address/0xadbF1854e5883eB8aa7BAf50705338739e558E5b/contracts Line 488 mint() function
    */
    function getLPTokenAmount(uint256 _mtokenAmount)
        internal
        view
        returns (uint256)
    {
        // getting pool reserves
        (uint112 _reserve0, uint112 _reserve1,) = pair.getReserves(); // gas savings
        // calculating pool token balances excluding the deposits of the user who wants to do an early withdraw
        // since everytime equal proportion of tokens are deposited hence subtracting with _mtokenAmount in both cases
        uint balance0ExcludingUserDeposit = mtoken.balanceOf(address(pair)).sub(_mtokenAmount);
        uint balance1ExcludingUserDeposit = matoken.balanceOf(address(pair)).sub(_mtokenAmount);
        // calculating liquidity token amount excluding the deposits of the user who wants to do an early withdraw
        uint amount0 = balance0ExcludingUserDeposit.sub(_reserve0);
        uint amount1 = balance1ExcludingUserDeposit.sub(_reserve1);
        uint liquidity = Math.min(amount0.mul(pair.totalSupply()) / _reserve0, amount1.mul(pair.totalSupply()) / _reserve1);
        // subtracting the total lp balance with the lp balance excluding users's share to get the lp tokens to burn
        uint lpTokensToBurn = pair.balanceOf(address(this)).sub(liquidity);
        return lpTokensToBurn;
    }

    /**
        Returns the current slippage rate by querying the quickswap contracts.
        @dev Note the the resultant amount is multiplied by 10**16 sice solidity does not handle decimal values
        Logic Used => Uniswap SDK https://github.com/Uniswap/uniswap-v2-sdk/blob/0db1207e6ca0dc138eaa8a8f40011723db7e9756/src/entities/pair.ts#L97  &  https://github.com/Uniswap/uniswap-v2-sdk/blob/0db1207e6ca0dc138eaa8a8f40011723db7e9756/src/entities/trade.ts#L28
     */
    function getCurrentSlippage(uint256 _swapAmt, bool reverseSwap)
        internal
        view
        returns (uint256)
    {
        // getting the reserve amounts
        (uint256 reserve0, uint256 reserve1, ) = pair.getReserves();
        // there is 0.3 % fee charged on each swap hence leaving that amount aside
        uint256 swapAmtWithFee = _swapAmt.mul(997);
        // calculate the amount based on reserve amounts and the swap amount including the fee
        uint256 numerator = reverseSwap
            ? swapAmtWithFee.mul(reserve0)
            : swapAmtWithFee.mul(reserve1);
        uint256 denominator = reverseSwap
            ? swapAmtWithFee.add(reserve1.mul(1000))
            : swapAmtWithFee.add(reserve0.mul(1000));
        uint256 outputAmt = numerator.mul(100000000).div(denominator);
        // calculating the slippage
        uint256 midPrice = reverseSwap
            ? reserve0.mul(100000000).div(reserve1)
            : reserve1.mul(100000000).div(reserve0);
        uint256 quote = midPrice.mul(_swapAmt);
        uint256 slippage = quote.sub(outputAmt).div(quote);
        return slippage;
    }

    /**
        Returns the current segment of the game using a 0-based index (returns 0 for the 1st segment ).
        @dev solidity does not return floating point numbers this will always return a whole number
     */
    function getCurrentSegment() public view returns (uint256) {
        return block.timestamp.sub(firstSegmentStart).div(segmentLength);
    }

    function isGameCompleted() public view returns (bool) {
        // Game is completed when the current segment is greater than "lastSegment" of the game.
        return getCurrentSegment() > lastSegment;
    }

    function joinGame() external whenNotPaused {
        require(getCurrentSegment() == 0, "Game has already started");
        require(
            players[msg.sender].addr != msg.sender,
            "Cannot join the game more than once"
        );
        Player memory newPlayer = Player({
            addr: msg.sender,
            mostRecentSegmentPaid: 0,
            amountPaid: 0,
            withdrawn: false
        });
        players[msg.sender] = newPlayer;
        iterablePlayers.push(msg.sender);
        emit JoinedGame(msg.sender, segmentPayment);

        // payment for first segment
        _transferDaiToContract();
    }

    /**
       @dev Allows anyone to deposit the previous segment funds into quickswap in this case the deposit follows this logic
       Swap half of the mUSDC for maUSDC - Adding liquidity to the pool - Approving the staking contract to spend the mUSDC-maUSDC LP tokens - Stake the mUSDC-maUSDC LP tokens.
       Deposits into the protocol can happen at any moment after segment 0 (first deposit window)
       is completed, as long as the game is not completed.
    */
    function depositIntoExternalPool(uint256 _slippage)
        external
        whenNotPaused
        whenGameIsNotCompleted
    {
        uint256 currentSegment = getCurrentSegment();
        require(
            currentSegment > 0,
            "Cannot deposit into underlying protocol during segment zero"
        );
        uint256 amount = segmentDeposit[currentSegment.sub(1)];
        require(
            amount > 0,
            "No amount from previous segment to deposit into protocol"
        );
        uint256 currentSlippage = getCurrentSlippage(amount, false);
        require(
            _slippage.mul(10**16) >= currentSlippage,
            "Can't execute swap due to slippage"
        ); // Sets deposited amount for previous segment to 0, avoiding double deposits into the protocol using funds from the current segment
        segmentDeposit[currentSegment.sub(1)] = 0;

        emit FundsDepositedIntoExternalPool(amount);
        uint256 musdcSwapAmt = amount.div(2);
        // swapping half the mtoken for matoken
        address[] memory pairTokens = new address[](2);
        pairTokens[0] = address(mtoken);
        pairTokens[1] = address(matoken);

        uint[] memory amounts = router.swapExactTokensForTokens(
            musdcSwapAmt,
            0,
            pairTokens,
            address(this),
            now.add(1200)
        );
        // since in path param we just have the 2 tokens hence checking the only element in the amounts array.
        require(amounts[0] > 0, "Output token amount is 0");
        // adding liquidity to the pool
        (, , uint liquidity) = router.addLiquidity(
            address(mtoken),
            address(matoken),
            musdcSwapAmt,
            musdcSwapAmt,
            0,
            0,
            address(this),
            now.add(1200)
        );
        // this safety check is sufficient
        require(liquidity > 0, "LP token amount is 0");
        // staking the lp tokens to earn $QUICK rewards
        uint256 lpTokenAmount = pair.balanceOf(address(this));
        // no return param here
        stake.stake(lpTokenAmount);
    }

    /**
       @dev Allows player to withdraw funds in the middle of the game with an early withdrawal fee deducted from the user's principal.
       earlyWithdrawalFee is set via constructor
    */
    function earlyWithdraw(uint256 _slippage)
        external
        whenNotPaused
        whenGameIsNotCompleted
    {
        Player storage player = players[msg.sender];
        // Makes sure player didn't withdraw; otherwise, player could withdraw multiple times.
        require(!player.withdrawn, "Player has already withdrawn");
        // since atokenunderlying has 1:1 ratio so we redeem the amount paid by the player
        player.withdrawn = true;
        // In an early withdraw, users get their principal minus the earlyWithdrawalFee % defined in the constructor.
        // So if earlyWithdrawalFee is 10% and deposit amount is 10 dai, player will get 9 dai back, keeping 1 dai in the pool.
        uint256 withdrawAmount = player.amountPaid.sub(
            player.amountPaid.mul(earlyWithdrawalFee).div(100)
        );
        // Decreases the totalGamePrincipal on earlyWithdraw
        totalGamePrincipal = totalGamePrincipal.sub(withdrawAmount);
        // BUG FIX - Deposit External Pool Tx reverted after an early withdraw
        // Fixed by first checking at what segment early withdraw happens if > 0 then re-assign current segment as -1
        // Since in deposit external pool the amount is calculated from the segmentDeposit mapping
        // and the amount is reduced by withdrawAmount
        uint256 currentSegment = getCurrentSegment();
        if (currentSegment > 0) {
            currentSegment = currentSegment.sub(1);
        }
        if (segmentDeposit[currentSegment] > 0) {
            if (segmentDeposit[currentSegment] >= withdrawAmount) {
                segmentDeposit[currentSegment] = segmentDeposit[currentSegment]
                    .sub(withdrawAmount);
            } else {
                segmentDeposit[currentSegment] = 0;
            }
        }

        uint256 contractBalance = IERC20(mtoken).balanceOf(address(this));

        emit EarlyWithdrawal(msg.sender, withdrawAmount);

        // Only withdraw funds from underlying pool if contract doesn't have enough balance to fulfill the early withdraw.
        // there is no redeem function in v2 it is replaced by withdraw in v2
        if (contractBalance < withdrawAmount) {

            uint poolTokensToBurn = getLPTokenAmount(withdrawAmount.sub(contractBalance));
            // remove 100% liquidity to get back the deposited mtoken and matoken
            (, uint amountB) = router.removeLiquidity(
                address(mtoken),
                address(matoken),
                poolTokensToBurn,
                0,
                0,
                address(this),
                now.add(1200)
            );
            require(amountB > 0, "matoken amount is 0");
            uint256 currentSlippage = getCurrentSlippage(
                amountB,
                true
            );
            require(
                _slippage.mul(10**16) >= currentSlippage,
                "Can't execute swap due to slippage"
            );
            // swap the received matoken after removing liquidity
            address[] memory inversePairTokens = new address[](2);
            inversePairTokens[0] = address(matoken);
            inversePairTokens[1] = address(mtoken);
            uint[] memory amounts = router.swapExactTokensForTokens(
                amountB,
                0,
                inversePairTokens,
                address(this),
                now.add(1200)
            );
            // since in path param we just have the 2 tokens hence checking the only element in the amounts array.
            require(amounts[0] > 0, "Output token amount is 0");
        }
        require(
            IERC20(mtoken).transfer(msg.sender, withdrawAmount),
            "Fail to transfer ERC20 tokens on early withdraw"
        );
    }

    /**
        Reedems funds from external pool and calculates total amount of interest for the game.
        @dev This method only redeems funds from the external pool, without doing any allocation of balances
             to users. This helps to prevent running out of gas and having funds locked into the external pool.
    */
    function redeemFromExternalPool(uint256 _slippage)
        public
        whenGameIsCompleted
    {
        require(!redeemed, "Redeem operation already happened for the game");
        redeemed = true;
        // aave has 1:1 peg for tokens and atokens
        // there is no redeem function in v2 it is replaced by withdraw in v2
        // Aave docs recommends using uint(-1) to withdraw the full balance. This is actually an overflow that results in the max uint256 value.
        if (matoken.balanceOf(address(this)) > 0) {
            uint256 currentSlippage = getCurrentSlippage(
                matoken.balanceOf(address(this)),
                true
            );
            require(
                _slippage.mul(10**16) >= currentSlippage,
                "Can't execute swap due to slippage"
            );
            // claiming rewards and getting back the staked lp tokens
            // no return param here
            stake.exit();
            // swap the claimed quick rewards with mtoken
            address[] memory inversePairTokens = new address[](2);
            inversePairTokens[0] = address(quick);
            inversePairTokens[1] = address(mtoken);
            uint[] memory amounts = router.swapExactTokensForTokens(
                quick.balanceOf(address(this)),
                0,
                inversePairTokens,
                address(this),
                now.add(1200)
            );
            // since in path param we just have the 2 tokens hence checking the only element in the amounts array.
            require(amounts[0] > 0, "Output token amount is 0");
            // remove 100% liquidity to get back the deposited mtoken and matoken
            (uint amountA, uint amountB) = router.removeLiquidity(
                address(mtoken),
                address(matoken),
                pair.balanceOf(address(this)),
                0,
                0,
                address(this),
                now.add(1200)
            );
            require(amountA > 0, "mtoken amount is 0");
            require(amountB > 0, "matoken amount is 0");
            // swapping the matoken for mtoken
            inversePairTokens[0] = address(matoken);
            amounts = router.swapExactTokensForTokens(
                matoken.balanceOf(address(this)),
                0,
                inversePairTokens,
                address(this),
                now.add(1200)
            );
            require(amounts[0] > 0, "Output token amount is 0");
        }
        uint256 totalBalance = IERC20(mtoken).balanceOf(address(this));
        // recording principal amount separately since adai balance will have interest has well
        if (totalBalance > totalGamePrincipal) {
            totalGameInterest = totalBalance.sub(totalGamePrincipal);
        } else {
            totalGameInterest = 0;
        }

        emit FundsRedeemedFromExternalPool(
            totalBalance,
            totalGamePrincipal,
            totalGameInterest
        );
        emit WinnersAnnouncement(winners);

        if (winners.length == 0) {
            require(
                IERC20(mtoken).transfer(owner(), totalGameInterest),
                "Fail to transfer ER20 tokens to owner"
            );
        }
    }

    // to be called by individual players to get the amount back once it is redeemed following the solidity withdraw pattern
    function withdraw(uint256 _slippage) external {
        Player storage player = players[msg.sender];
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;

        uint256 payout = player.amountPaid;
        if (player.mostRecentSegmentPaid == lastSegment.sub(1)) {
            // Player is a winner and gets a bonus!
            // No need to worry about if winners.length = 0
            // If we're in this block then the user is a winner
            // only add interest if there are winners
            if (winners.length > 0) {
                payout = payout.add(totalGameInterest / winners.length);
            }
        }
        emit Withdrawal(msg.sender, payout);

        // First player to withdraw redeems everyone's funds
        if (!redeemed) {
            redeemFromExternalPool(_slippage);
        }

        require(
            IERC20(mtoken).transfer(msg.sender, payout),
            "Fail to transfer ERC20 tokens on withdraw"
        );
    }

    function makeDeposit() external whenNotPaused {
        // only registered players can deposit
        require(
            !players[msg.sender].withdrawn,
            "Player already withdraw from game"
        );
        require(
            players[msg.sender].addr == msg.sender,
            "Sender is not a player"
        );

        uint256 currentSegment = getCurrentSegment();
        // User can only deposit between segment 1 and segmetn n-1 (where n the number of segments for the game).
        // Details:
        // Segment 0 is paid when user joins the game (the first deposit window).
        // Last segment doesn't accept payments, because the payment window for the last
        // segment happens on segment n-1 (penultimate segment).
        // Any segment greather than the last segment means the game is completed, and cannot
        // receive payments
        require(
            currentSegment > 0 && currentSegment < lastSegment,
            "Deposit available only between segment 1 and segment n-1 (penultimate)"
        );

        //check if current segment is currently unpaid
        require(
            players[msg.sender].mostRecentSegmentPaid != currentSegment,
            "Player already paid current segment"
        );

        // check player has made payments up to the previous segment
        require(
            players[msg.sender].mostRecentSegmentPaid == currentSegment.sub(1),
            "Player didn't pay the previous segment - game over!"
        );

        // check if this is deposit for the last segment
        // if so, the user is a winner
        if (currentSegment == lastSegment.sub(1)) {
            winners.push(msg.sender);
        }

        emit Deposit(msg.sender, currentSegment, segmentPayment);

        //:moneybag:allow deposit to happen
        _transferDaiToContract();
    }
}
