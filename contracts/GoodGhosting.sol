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


    uint public mostRecentSegmentTimeStamp;
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
    mapping(address => Player) players;


    uint public lastSegmentNum;
    uint public startSegementTime;
    uint public currentSegment;
    uint public weekInSecs;
    uint public timeElapsed;
    uint public currentTime; //🚨 delete when not needed

    event SendMessage(address reciever, string message);



    constructor(IERC20 _inboundCurrency, IERC20 _interestCurrency, ILendingPoolAddressesProvider _lendingPoolAddressProvider) public {
        daiToken = _inboundCurrency;
        adaiToken = _interestCurrency;
        lendingPoolAddressProvider = _lendingPoolAddressProvider;
        thisContract = address(this);
        mostRecentSegmentTimeStamp = block.timestamp;
        firstSegmentStart = block.timestamp;
        mostRecentSegmentPaid = 0;
        lastSegment = 16;
        moneyPot = 0;
        segmentPayment = 10;
      


        lastSegmentNum = 16;
        startSegementTime = now;
        currentSegment = 0;
        weekInSecs = 604800;
    

        // Allow lending pool convert DAI deposited on this contract to aDAI on lending pool
        uint MAX_ALLOWANCE = 2**256 - 1;
        address core = lendingPoolAddressProvider.getLendingPoolCore();
        daiToken.approve(core, MAX_ALLOWANCE);
    }

    function getDaiTokenAddress() public view returns (address ){
        return address(daiToken);
    }

    function getThisContractAddress() public view returns(address){
        return address(this);
    }



    function _transferDaiToContract() internal {
        ILendingPool lendingPool = ILendingPool(lendingPoolAddressProvider.getLendingPool());

        // daiToken.transferFrom(msg.sender, thisContract, segmentPayment);
        require(daiToken.allowance(msg.sender, thisContract) >= segmentPayment , "You need to have allowance to do transfer DAI on the smart contract");
        // require(daiToken.balanceOf(address(this)) >= segmentPayment, "good ghosting smart contract needs to hold enough Dai to transfer to aDai");
        // // transfer dai to aDai and redirect stream
        // _convertDAItoADAI(segmentPayment);
        require(daiToken.transferFrom(msg.sender, thisContract, segmentPayment) == true, "Transfer failed");
        lendingPool.deposit(address(daiToken), segmentPayment, 0);


        //🚨TODO hand this so it only happens if tranferFrom did happen
        mostRecentSegmentPaid = mostRecentSegmentPaid + 1;
        mostRecentSegmentTimeStamp = mostRecentSegmentTimeStamp + 1 weeks;
    }

    //getCurrentSegment
    // 🚨make internal
    function getCurrentSegment() public  returns (uint){

       return ((block.timestamp - firstSegmentStart)/ weekInSecs);
    }

    
    // consider replacing timestamp with block number
    function checkSegment(uint timeSince) public {
        if(lastSegment == mostRecentSegmentPaid){
            emit SendMessage(msg.sender, "game finished");
            return;
        } else if (now > (timeSince + 2 weeks)){
            emit SendMessage(msg.sender, "out of game, not possible to deposit");
            return;
        } else if (now >= (timeSince + 1 weeks) && now <= (timeSince + 2 weeks)) {
            _transferDaiToContract();
            emit SendMessage(msg.sender, "payment made");
            return;
        } else {
            emit SendMessage(msg.sender, "too early to pay");
        return;
        }
    }

    function joinGame () public {
        require(now <= firstSegmentStart + 1 weeks, "game has already started");
        Player memory newPlayer = Player({
            addr : msg.sender,
            mostRecentSegmentPaid : 0,
            amountPaid : 0
        });
        players[msg.sender] = newPlayer;
        emit SendMessage(msg.sender, "game joined");
    }


    function makeDeposit() public {
        // only registered players can deposit
        require(players[msg.sender].addr == msg.sender, "not registered");
        checkSegment(mostRecentSegmentTimeStamp);
    }


    function getLastSegment() public view returns (uint){
        return lastSegment;
    }

    function getMostRecentSegmentPaid() public view returns (uint){
        return mostRecentSegmentPaid;
    }
}
