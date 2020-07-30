pragma solidity ^0.5.0;

/**
 * Play the save game.
 *
 * No SafeMath was used (yet) to shortcut the hacking time.
 *
 * Short game duration for testing purposes
 *
 * Arguments to pass while deploing on Kovan: 0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD, 0x58AD4cB396411B691A9AAb6F74545b2C5217FE6a, 0x506B0B2CF20FAA8f38a4E2B524EE43e1f4458Cc5
 */


contract GoodGhosting {

    address public thisContract;
    // Token that players use to buy in the game - DAI
    IERC20 public daiToken;

    // Pointer to aDAI
    IERC20 public adaiToken;

    // Which Aave instance we use to swap DAI to interest bearing aDAI
    ILendingPoolAddressesProvider public lendingPoolAddressProvider;


    uint public mostRecentSegmentPaid;
    uint public moneyPot;
    uint public segmentPayment;
    uint public lastSegment;
    uint public firstSegmentStart;
    struct Player {
        address addr;
        uint mostRecentSegmentPaid;
        uint amountPaid;
    }
    mapping(address => Player)public players;


    uint public segmentLength;
    uint public timeElapsed;
    address public admin;

    event SendMessage(address receiver, string message);
    event SendUint(address receiver, uint numMessage);


    constructor(IERC20 _inboundCurrency, IERC20 _interestCurrency, ILendingPoolAddressesProvider _lendingPoolAddressProvider) public {
        daiToken = _inboundCurrency;
        adaiToken = _interestCurrency;
        lendingPoolAddressProvider = _lendingPoolAddressProvider;
        thisContract = address(this);
        firstSegmentStart = block.timestamp;  //get current time
        mostRecentSegmentPaid = 0;
        lastSegment = 6;   //reduced number of segments for testing purposes
        moneyPot = 0;
        segmentPayment = 10 * (10 ** 18); // equivalent to 10 Dai

        segmentLength = 180; // The number of seconds each game segment comprises of. E.g. 180 sec = 3 minutes
        admin = msg.sender;

        // Allow lending pool convert DAI deposited on this contract to aDAI on lending pool
        uint MAX_ALLOWANCE = 2**256 - 1;
        address core = lendingPoolAddressProvider.getLendingPoolCore();
        daiToken.approve(core, MAX_ALLOWANCE);
    }


    function _transferDaiToContract() internal {

        // users pays dai in to the smart contract, which he pre-approved to spend the DAI for him
        // convert DAI to aDAI using the lending pool
        // 🚨 TO DO - check for potential re-entrancy attack 🚨 warning by Remix:  Potential violation of Checks-Effects-Interaction pattern
        ILendingPool lendingPool = ILendingPool(lendingPoolAddressProvider.getLendingPool());
        // emit SendUint(msg.sender, daiToken.allowance(msg.sender, thisContract))
        require(daiToken.allowance(msg.sender, thisContract) >= segmentPayment , "You need to have allowance to do transfer DAI on the smart contract");
        require(daiToken.transferFrom(msg.sender, thisContract, segmentPayment) == true, "Transfer failed");

        // lendPool.deposit does not currently return a value,
        // so it is not possible use a require statement to check.
        // if it doesn't revert, we assume it's successful
        lendingPool.deposit(address(daiToken), segmentPayment, 0);

        players[msg.sender].mostRecentSegmentPaid = players[msg.sender].mostRecentSegmentPaid + 1;
        players[msg.sender].amountPaid = players[msg.sender].amountPaid + segmentPayment;
        emit SendMessage(msg.sender, 'payment made');
    }


    function getCurrentSegment() view public returns (uint){
        // Note solidity does not return floating point numbers
        // this will always return a whole number
       return ((block.timestamp - firstSegmentStart) / segmentLength);
    }



    function joinGame() public {
        require(now <= firstSegmentStart + 1 weeks, "game has already started");
        Player memory newPlayer = Player({
            addr : msg.sender,
            mostRecentSegmentPaid : 0,
            amountPaid : 0
        });

        //🚨TODO add check if player exisits
        players[msg.sender] = newPlayer;
        emit SendMessage(msg.sender, "game joined");
    }


    function makePayout() public {
        require(players[msg.sender].addr == msg.sender, "only registered players can call this method");
        uint currentSegment = getCurrentSegment();
        require(currentSegment > lastSegment, "too early to payout");
        emit SendMessage(msg.sender, "payout process starting");
    }


    function makeDeposit() public {
        // only registered players can deposit
        require(players[msg.sender].addr == msg.sender, "not registered");

        uint currentSegment = getCurrentSegment();
        // should not be stagging segment
        require(currentSegment > 0, "too early to pay");  //🚨 Might be removed - to discuss

        //check if current segment is currently unpaid
        require(players[msg.sender].mostRecentSegmentPaid != currentSegment, "current segment already paid");

        //check player has made payments up to the previous segment
        // 🚨 TODO check this is OK for first payment
        require(players[msg.sender].mostRecentSegmentPaid == (currentSegment - 1),
           "previous segment was not paid - out of game"
        );

        //💰allow deposit to happen
        _transferDaiToContract();
    }

}

/*/ For quick testing via Remix, removed contract dependencies and just included them here
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../aave/ILendingPoolAddressesProvider.sol";
import "../aave/ILendingPool.sol";
/*/

contract ILendingPool {
    function deposit(address _reserve, uint256 _amount, uint16 _referralCode) public;
    //see: https://github.com/aave/aave-protocol/blob/1ff8418eb5c73ce233ac44bfb7541d07828b273f/contracts/tokenization/AToken.sol#L218
    function redeem(uint256 _amount) external;
}


/**
@title ILendingPoolAddressesProvider interface
@notice provides the interface to fetch the LendingPoolCore address
 */

contract ILendingPoolAddressesProvider {

    function getLendingPool() public view returns (address);
    function setLendingPoolImpl(address _pool) public;

    function getLendingPoolCore() public view returns (address payable);
    function setLendingPoolCoreImpl(address _lendingPoolCore) public;

    function getLendingPoolConfigurator() public view returns (address);
    function setLendingPoolConfiguratorImpl(address _configurator) public;

    function getLendingPoolDataProvider() public view returns (address);
    function setLendingPoolDataProviderImpl(address _provider) public;

    function getLendingPoolParametersProvider() public view returns (address);
    function setLendingPoolParametersProviderImpl(address _parametersProvider) public;

    function getTokenDistributor() public view returns (address);
    function setTokenDistributor(address _tokenDistributor) public;


    function getFeeProvider() public view returns (address);
    function setFeeProviderImpl(address _feeProvider) public;

    function getLendingPoolLiquidationManager() public view returns (address);
    function setLendingPoolLiquidationManager(address _manager) public;

    function getLendingPoolManager() public view returns (address);
    function setLendingPoolManager(address _lendingPoolManager) public;

    function getPriceOracle() public view returns (address);
    function setPriceOracle(address _priceOracle) public;

    function getLendingRateOracle() public view returns (address);
    function setLendingRateOracle(address _lendingRateOracle) public;

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
