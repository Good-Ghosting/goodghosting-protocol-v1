// SPDX-License-Identifier: UNLICENSED

pragma solidity ^0.6.0;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

/**
 * Play the save game.
 *
 * Short game duration for testing purposes
 *
 * Arguments to pass while deploing on Kovan: 0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD, 0x506B0B2CF20FAA8f38a4E2B524EE43e1f4458Cc5
 */

contract GoodGhosting is Ownable, Pausable {
    using SafeMath for uint256;

    // Controls if tokens were redeemed or not from the pool
    bool public redeemed;
    // Stores the total amount of interest received in the game.
    uint public totalGameInterest;
    //  total principal amount
    uint public totalGamePrincipal;

    // Token that players use to buy in the game - DAI
    IERC20 public immutable daiToken;
    // Pointer to aDAI
    AToken public immutable adaiToken;
    // Which Aave instance we use to swap DAI to interest bearing aDAI
    ILendingPoolAddressesProvider immutable public lendingPoolAddressProvider;

    uint public immutable segmentPayment;
    uint public immutable lastSegment;
    uint public immutable firstSegmentStart;
    uint public immutable segmentLength;
    uint public immutable earlyWithdrawalFee;

    struct Player {
        address addr;
        bool withdrawn;
        uint mostRecentSegmentPaid;
        uint amountPaid;
    }
    mapping(address => Player) public players;
    // we need to differentiate the deposit amount to aave or any other protocol for each window hence this mapping segment no => total deposit amount for that
    mapping (uint256 => uint256) public segmentDeposit;
    address[] public iterablePlayers;
    address[] public winners;


    event JoinedGame(address indexed player, uint amount);
    event Deposit(address indexed player, uint indexed segment, uint amount);
    event Withdrawal(address indexed player, uint amount);
    event FundsRedeemedFromExternalPool(uint totalAmount, uint totalGamePrincipal, uint totalGameInterest);
    event WinnersAnnouncement(address[] winners);
    event EarlyWithdrawal(address indexed player, uint amount);

    modifier whenGameIsCompleted() {
        // Game is completed when the current segment is greater than "lastSegment" of the game plus and additional segment
        // since with deposit window we need to to wait for extra for aave deposit for last segemnt
        // but once the protocol deposit is made for the last segment we need to wait one extra segment for the the last segment deposit to accure interest
        require(getCurrentSegment() > lastSegment.add(1), 'Game is not completed');
        _;
    }

    modifier whenGameIsNotCompleted() {
        // Game is completed when the current segment is greater than "lastSegment" of the game plus and additional segment
        // since with deposit window we need to to wait for extra for aave deposit for last segemnt
        // but once the protocol deposit is made for the last segment we need to wait one extra segment for the the last segment deposit to accure interest
        require(getCurrentSegment() < lastSegment.add(2), 'Game is already completed');
        _;
    }

    /**
        Creates a new instance of GoodGhosting game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _lendingPoolAddressProvider Smart contract address of the lending pool adddress provider.
        @param _segmentCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment (i.e. 10*10**18 equals to 10 DAI - note that DAI uses 18 decimal places).
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
     */
    constructor(
        IERC20 _inboundCurrency,
        ILendingPoolAddressesProvider _lendingPoolAddressProvider,
        uint _segmentCount,
        uint _segmentLength,
        uint _segmentPayment,
        uint _earlyWithdrawalFee
    ) public {
        // Initializes default variables
        firstSegmentStart = block.timestamp;  //gets current time
        lastSegment = _segmentCount;
        segmentLength = _segmentLength;
        segmentPayment = _segmentPayment;
        earlyWithdrawalFee = _earlyWithdrawalFee;
        daiToken = _inboundCurrency;
        lendingPoolAddressProvider = _lendingPoolAddressProvider;

        ILendingPoolCore lendingPoolCore = ILendingPoolCore(_lendingPoolAddressProvider.getLendingPoolCore());
        address adaiTokenAddress = lendingPoolCore.getReserveATokenAddress(address(_inboundCurrency));
        require(adaiTokenAddress != address(0), "Aave doesn't support _inboundCurrency");
        adaiToken = AToken(adaiTokenAddress);

        // Allows the lending pool to convert DAI deposited on this contract to aDAI on lending pool
        uint MAX_ALLOWANCE = 2**256 - 1;
        _inboundCurrency.approve(address(lendingPoolCore), MAX_ALLOWANCE);
    }

    function pause() public onlyOwner whenNotPaused {
        _pause();
    }

    function unpause() public onlyOwner whenPaused {
        _unpause();
    }

    function _transferDaiToContract() internal {

        // users pays dai in to the smart contract, which he pre-approved to spend the DAI for him
        // convert DAI to aDAI using the lending pool
        // this doesn't make sense since we are already transferring
        require(daiToken.allowance(msg.sender, address(this)) >= segmentPayment , "You need to have allowance to do transfer DAI on the smart contract");

        uint currentSegment = getCurrentSegment();

        players[msg.sender].mostRecentSegmentPaid = currentSegment;
        players[msg.sender].amountPaid = players[msg.sender].amountPaid.add(segmentPayment);
        totalGamePrincipal = totalGamePrincipal.add(segmentPayment);
        segmentDeposit[currentSegment] = segmentDeposit[currentSegment].add(segmentPayment);
        // SECURITY NOTE:
        // Interacting with the external contracts should be the last action in the logic to avoid re-entracy attacks.
        // Re-entrancy: https://solidity.readthedocs.io/en/v0.6.12/security-considerations.html#re-entrancy
        // Check-Effects-Interactions Pattern: https://solidity.readthedocs.io/en/v0.6.12/security-considerations.html#use-the-checks-effects-interactions-pattern
        require(daiToken.transferFrom(msg.sender, address(this), segmentPayment), "Transfer failed");
    }

    /**
        Returns the current segment of the game using a 0-based index (returns 0 for the 1st segment ).
        @dev solidity does not return floating point numbers this will always return a whole number
     */
    function getCurrentSegment() view public returns (uint){
       return block.timestamp.sub(firstSegmentStart).div(segmentLength);
    }


    function joinGame() external whenNotPaused {
        require(now < firstSegmentStart.add(segmentLength), "game has already started");
        require(players[msg.sender].addr != msg.sender, "The player should not have joined the game before");
        Player memory newPlayer = Player({
            addr: msg.sender,
            mostRecentSegmentPaid: 0,
            amountPaid: 0,
            withdrawn: false
        });
        players[msg.sender] = newPlayer;
        iterablePlayers.push(msg.sender);
        // for first segment
        _transferDaiToContract();
        emit JoinedGame(msg.sender, segmentPayment);
    }

    /**
       @dev Allows anyone to deposit the previous segment funds to aave.
    */
    function protocolDeposit() external whenNotPaused {
        uint currentSegment = getCurrentSegment();
        require(currentSegment > 0, "First Segment has not started");
        // since the deposit window for 1st segments stats before hence checking whether the deposit window for prev. segment has finished or not
        require(now > firstSegmentStart.add(segmentLength.mul(currentSegment)), "Deposit Window of previous segment is not finished");
        uint256 amount = segmentDeposit[currentSegment.sub(1)];
        require(amount > 0, "Segment has no deposits");
        ILendingPool lendingPool = ILendingPool(lendingPoolAddressProvider.getLendingPool());
        lendingPool.deposit(address(daiToken), amount, 0);
    }

    /**
       @dev Allows player to withdraw funds in the middle of the game with an early withdrawal fee deducted from the user's principal.
       earlyWithdrawalFee is set via constructor
    */
    function earlyWithdraw() external whenNotPaused whenGameIsNotCompleted {
        Player storage player = players[msg.sender];
        // since atokenunderlying has 1:1 ratio so we redeem the amount paid by the player
        player.withdrawn = true;
        // In an early withdraw, users get their principal minus the earlyWithdrawalFee % defined in the constructor.
        // So if earlyWithdrawalFee is 10% and deposit amount is 10 dai, player will get 9 dai back, losing 1 dai.
        uint withdrawAmount = player.amountPaid.sub(player.amountPaid.mul(earlyWithdrawalFee).div(100));
        uint contractBalance = IERC20(daiToken).balanceOf(address(this));
        // Only withdraw funds from underlying pool if contract doesn't have enough balance to fulfill the early withdraw.
        if (contractBalance < withdrawAmount) {
           AToken(adaiToken).redeem(withdrawAmount.sub(contractBalance));
        }
        IERC20(daiToken).transfer(msg.sender, withdrawAmount);
        emit EarlyWithdrawal(msg.sender, withdrawAmount);
    }

    /**
        Reedems funds from external pool and calculates total amount of interest for the game.
        @dev This method only redeems funds from the external pool, without doing any allocation of balances
             to users. This helps to prevent running out of gas and having funds locked into the external pool.
    */
    function redeemFromExternalPool() public whenGameIsCompleted {
        require(!redeemed, "Redeem operation already happened for the game");
        redeemed = true;
        // aave has 1:1 peg for tokens and atokens
        uint adaiBalance = AToken(adaiToken).balanceOf(address(this));
        AToken(adaiToken).redeem(adaiBalance);
        uint totalBalance = IERC20(daiToken).balanceOf(address(this));
        // recording principal amount separately since adai balance will have interest has well
        totalGameInterest = totalBalance.sub(totalGamePrincipal);
        emit FundsRedeemedFromExternalPool(totalBalance, totalGamePrincipal, totalGameInterest);
        emit WinnersAnnouncement(winners);
    }

    // to be called by individual players to get the amount back once it is redeemed following the solidity withdraw pattern
    function withdraw() external {
        // First player to withdraw redeems everyone's funds
        if (!redeemed) {
            redeemFromExternalPool();
        }

        Player storage player = players[msg.sender];
        require(!player.withdrawn, 'Player has already withdrawn');
        player.withdrawn = true;

        uint256 payout = player.amountPaid;
        if (player.mostRecentSegmentPaid == lastSegment.sub(1)){
            // Player is a winner and gets a bonus!
            // No need to worry about if winners.length = 0
            // If we're in this block then the user is a winner
            payout = payout.add(totalGameInterest / winners.length);
        }
        IERC20(daiToken).transfer(msg.sender, payout);
        emit Withdrawal(msg.sender, payout);
    }


    function makeDeposit() external whenNotPaused whenGameIsNotCompleted {
        // only registered players can deposit
        require(!players[msg.sender].withdrawn, "Player is not a part of the game");
        require(players[msg.sender].addr == msg.sender, "Sender is not a player");

        uint currentSegment = getCurrentSegment();
        // should not be staging segment
        require(currentSegment > 0, "Deposits start after the first segment");

        //check if current segment is currently unpaid
        require(players[msg.sender].mostRecentSegmentPaid != currentSegment, "Player already paid current segment");

        // check player has made payments up to the previous segment
        // currentSegment will return 1 when the user pays for current segment
        if (currentSegment != 1) {
           require(players[msg.sender].mostRecentSegmentPaid == (currentSegment.sub(1)),
           "Player didn't pay the previous segment - game over!"
        );
        }
        //💰allow deposit to happen
        _transferDaiToContract();

        // check if this is deposit for the last segment
        // if so, the user is a winner
        if (currentSegment == lastSegment.sub(1)) {
            winners.push(msg.sender);
        }
        emit Deposit(msg.sender, currentSegment, segmentPayment);
    }

}

/*/ For quick testing via Remix, removed contract dependencies and just included them here
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../aave/ILendingPoolAddressesProvider.sol";
import "../aave/ILendingPool.sol";
/*/

abstract contract ILendingPool {
    function deposit(address _reserve, uint256 _amount, uint16 _referralCode) public virtual;
}

interface ILendingPoolCore {
    function getReserveATokenAddress(address _reserve) external returns (address);
}

interface AToken {
    function redeem(uint256 _amount) external;

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);
}


/**
@title ILendingPoolAddressesProvider interface
@notice provides the interface to fetch the LendingPoolCore address
 */

abstract contract ILendingPoolAddressesProvider {

    function getLendingPool() public virtual view returns (address);
    function setLendingPoolImpl(address _pool) public virtual;

    function getLendingPoolCore() public virtual view returns (address payable);
    function setLendingPoolCoreImpl(address _lendingPoolCore) public virtual;

    function getLendingPoolConfigurator() public virtual view returns (address);
    function setLendingPoolConfiguratorImpl(address _configurator) public virtual;

    function getLendingPoolDataProvider() public virtual view returns (address);
    function setLendingPoolDataProviderImpl(address _provider) public virtual;

    function getLendingPoolParametersProvider() public virtual view returns (address);
    function setLendingPoolParametersProviderImpl(address _parametersProvider) public virtual;

    function getTokenDistributor() public virtual view returns (address);
    function setTokenDistributor(address _tokenDistributor) public virtual;


    function getFeeProvider() public virtual view returns (address);
    function setFeeProviderImpl(address _feeProvider) public virtual;

    function getLendingPoolLiquidationManager() public virtual view returns (address);
    function setLendingPoolLiquidationManager(address _manager) public virtual;

    function getLendingPoolManager() public virtual view returns (address);
    function setLendingPoolManager(address _lendingPoolManager) public virtual;

    function getPriceOracle() public virtual view returns (address);
    function setPriceOracle(address _priceOracle) public virtual;

    function getLendingRateOracle() public virtual view returns (address);
    function setLendingRateOracle(address _lendingRateOracle) public virtual;

}


/**
 * @dev Interface of the ERC20 standard as defined in the EIP.
 */
interface IERC20 {
    /**
     * @dev Returns the amount of tokens in existence.
     */
    function totalSupply() external view returns (uint256);

    /**
     * @dev Returns the amount of tokens owned by `account`.
     */
    function balanceOf(address account) external view returns (uint256);

    /**
     * @dev Moves `amount` tokens from the caller's account to `recipient`.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transfer(address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Returns the remaining number of tokens that `spender` will be
     * allowed to spend on behalf of `owner` through {transferFrom}. This is
     * zero by default.
     *
     * This value changes when {approve} or {transferFrom} are called.
     */
    function allowance(address owner, address spender) external view returns (uint256);

    /**
     * @dev Sets `amount` as the allowance of `spender` over the caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 amount) external returns (bool);

    /**
     * @dev Moves `amount` tokens from `sender` to `recipient` using the
     * allowance mechanism. `amount` is then deducted from the caller's
     * allowance.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * Emits a {Transfer} event.
     */
    function transferFrom(address sender, address recipient, uint256 amount) external returns (bool);

    /**
     * @dev Emitted when `value` tokens are moved from one account (`from`) to
     * another (`to`).
     *
     * Note that `value` may be zero.
     */
    event Transfer(address indexed from, address indexed to, uint256 value);

    /**
     * @dev Emitted when the allowance of a `spender` for an `owner` is set by
     * a call to {approve}. `value` is the new allowance.
     */
    event Approval(address indexed owner, address indexed spender, uint256 value);
}
