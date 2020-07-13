pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "../aave/ILendingPoolAddressesProvider.sol";
import "../aave/ILendingPool.sol";

/**
 * Play the save game.
 *
 * No safe math was though to shortcut the hacking time.
 *
 */
contract GoodGhosting {

    address public thisContract;
    // Token that patients use to buy in the game - DAI
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


    uint public startSegementTime;
    uint public weekInSecs;
    uint public timeElapsed;
    address public admin;

    event SendMessage(address receiver, string message);
    event SendUint(address receiver, uint numMessage);


    constructor(IERC20 _inboundCurrency, IERC20 _interestCurrency, ILendingPoolAddressesProvider _lendingPoolAddressProvider) public {
        daiToken = _inboundCurrency;
        adaiToken = _interestCurrency;
        lendingPoolAddressProvider = _lendingPoolAddressProvider;
        thisContract = address(this);
        firstSegmentStart = block.timestamp; // 🚨duplicate
        mostRecentSegmentPaid = 0;
        lastSegment = 16;
        moneyPot = 0;
        segmentPayment = 10 * (10 ** 18); // equivalent to 10 Dai

        startSegementTime = now; // 🚨duplicate
        weekInSecs = 604800;
        admin = msg.sender;
    
        // Allow lending pool convert DAI deposited on this contract to aDAI on lending pool
        uint MAX_ALLOWANCE = 2**256 - 1;
        address core = lendingPoolAddressProvider.getLendingPoolCore();
        daiToken.approve(core, MAX_ALLOWANCE);
    }


    function _transferDaiToContract() internal {

        //users pay dai in to smart contract which the approves
        // Dai to aDai using the lending pool
        ILendingPool lendingPool = ILendingPool(lendingPoolAddressProvider.getLendingPool());
        uint daiAllowance = daiToken.allowance(msg.sender, thisContract);
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


    // only for use in test env to check internal function
    function testGetCurrentSegment() public returns (uint) {
        require(msg.sender == admin, "not admin");
        return _getCurrentSegment();
    }

    function _getCurrentSegment() internal  returns (uint){
        // Note solidity does not return floating point numbers
        // this will always return a whole number
       return ((block.timestamp - firstSegmentStart)/ weekInSecs);
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

    // only for use in test env to check internal function
    // function testMakePayout() public returns (uint) {
    //     require(msg.sender == admin, "not admin");
    //     return _makePayout();
    // }


    function _makePayout() internal {
        emit SendMessage(msg.sender, "payout process starting");
    }


    function makeDeposit() public {
        // only registered players can deposit
        require(players[msg.sender].addr == msg.sender, "not registered");
        
        uint currentSegment = _getCurrentSegment();
        // should not be stagging segment
        require(currentSegment > 0, "too early to pay");

        if(currentSegment > lastSegment){
            _makePayout();
            return;
        }

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
