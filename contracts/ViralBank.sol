pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Play the save game
contract ViralBank {

    // A short cut to figure out what this contract is doing
    // See getState()
    enum GameState {
        Starting,  // All players must do the first buy in with startGame()
        Playing,   // Monthly buy ins going with buyInMonthly()
        Cleaning,  // Need to manually call clean up for every player checkForDead()
        PayingOut  // Dividends are ready to be claimed with todo()
    }

    // Token that patients use to buy in the game - DAI
    IERC20 public inboundCurrency;

    // Pointer to aDAI
    IERC20 public interestCurrency;

    // What is the monthly payment and buy in
    // Now 9.90 DAI
    uint public ticketSize = 9.90 * 10**18;

    // How many players started the journey
    uint public playerCount = 0;

    // How many people made it - after clean up
    uint public finishedPlayerCount = 0;

    // When the game started
    uint public startedAt = now;

    // How long we want to play
    uint public constant ROUND_LENGTH = 30 days;
    uint public constant INCUBATION_PERIOD = ROUND_LENGTH; // Can't differ - simplified math
    uint public constant GAME_LENGTH = 12 * 30 days;

    // Book keeping
    address public patientZero;
    mapping(address => uint) public balances;
    uint public raisedMoney;

    // Track if the player has been keeping up with the game
    mapping(address => uint) public lastActivityAt;
    mapping(address => uint) public lastRound;

    //
    // Referral system
    //

    // player who bought in -> his/her referral
    mapping(address => address) public referrals;
    mapping(address => uint) public referrerCount;

    // how many interest shares each player has
    mapping(address => uint) public allocations;
    uint public totalAllocations = 0;


    //
    // Final score calculations
    //

    // Have we executed clean up for this player
    mapping(address => bool) public cleanedUp;
    uint public cleanedUpPlayerCount;

    // How much shares for the prize pool was left after eliminating all the dead
    uint public aliveAllocations = 0;

    constructor(IERC20 _inboundCurrency, IERC20 _interestCurrency) public {
        inboundCurrency = _inboundCurrency;
        interestCurrency = _interestCurrency;
    }

    // A new player joins the game
    function startGame(address referral) public {

        require(!isIncubationPeriodOver(), "Cannot come in after the pets have escaped the lab");
        require(areWeHavingFun(), "Game has ended");

        if(playerCount == 0) {
            // Patient zero
            require(referral == address(0), "Patient zero has no referral");
            patientZero = msg.sender;
        } else {
            require(referral != address(0), "All players must have a referral");
            require(isValidPlayer(referral), "Dead players cannot refer");

            // Referring player gets 10% interested earned by this player
            allocations[referral] += 10;
            totalAllocations += 10;
        }

        require(lastRound[msg.sender] == 0, "Need to start at round zero");
        _buyIn();

        playerCount++;

        referrals[msg.sender] = referral;

        // Superinfecter board update
        // TODO: Emit a sorted event?
        referrerCount[referral] += 1;

        // This player gets full interest for themselves
        allocations[msg.sender] += 100;
        totalAllocations += 100;

        // Second level multi marketing pyramid
        address secondLevel = referrals[referral];
        if(secondLevel != address(0)) {
            // Second level referrers give you 1% of their interest
            allocations[secondLevel] += 1;
            totalAllocations += 1;
        }
    }

    // Need to hit this every month or you are out of the game
    function buyInMonthly() public {
        require(areWeHavingFun(), "Game has ended");
        require(isValidPlayer(msg.sender), "You are not infected. Stay away from the game.");
        require(lastRound[msg.sender] == getCurrentRoundNumber() - 1, "You need to be on the previous round to buy in the next one");

        _buyIn();
    }

    // Transaction sender updates his playing stats and money gets banked
    function _buyIn() internal {
        inboundCurrency.transferFrom(msg.sender, address(this), ticketSize);
        _swapToInterestBearing(ticketSize);

        lastActivityAt[msg.sender] = now;
        lastRound[msg.sender] = getCurrentRoundNumber();
        balances[msg.sender] += ticketSize;
        raisedMoney += ticketSize;
    }

    // Remove allocations for players who failed
    // A state clean up when before the final dividend.
    // Must be manually called for every player
    // https://www.youtube.com/watch?v=GU0d8kpybVg
    function checkForDead(address addr) public {

        require(!areWeHavingFun(), "Game still goes on");
        require(isPlayerAddress(addr), "Was not a player");
        require(cleanedUp[addr] == false, "Player has already been cleaned up");

        if(aliveAllocations == 0) {
            aliveAllocations = totalAllocations;
        }

        // Player failed, no prize for them
        if(!hasPlayerFinishedGame(addr)) {
            aliveAllocations -= allocations[addr];
            allocations[addr] = 0;
        } else {
            finishedPlayerCount++;
        }

        cleanedUpPlayerCount++;
        cleanedUp[addr] = true;
    }

    // Swap the deposited DAI to aDAI
    function _swapToInterestBearing(uint amount) internal {
        // TODO: Insert Aave
    }

    // Check for the game master
    function isPatientZero(address addr) public view returns(bool) {
        return addr == patientZero;
    }

    // Cannot come in after incubation perios is over
    function isIncubationPeriodOver() public view returns(bool) {
        return now > startedAt + INCUBATION_PERIOD;
    }

    // Did this player play the game in some point
    // 1. Still playing
    // 2. Was playing / withdraw
    // 3. Was playing / dropped out
    function isPlayerAddress(address addr) public view returns(bool) {
        return isPatientZero(addr) || referrals[addr] != address(0);
    }

    /** The player has started the game and has not dropped out */
    function isValidPlayer(address addr) public view returns(bool) {
        if(getCurrentRoundNumber() == 0) {
            return balances[addr] > 0;
        } else {
            // Player is on the current or previous round
            return (getCurrentRoundNumber() - lastRound[addr]) <= 1;
        }
    }

    // Zero for the incubation, 12 is when the game ends
    function getCurrentRoundNumber() public view returns(uint) {
        return (now - startedAt) / ROUND_LENGTH;
    }

    function getLastRoundNumber() public pure returns(uint) {
        return GAME_LENGTH / ROUND_LENGTH;
    }

    // When the next round of deposits needs to get in,
    function getNextDepositStarts() public view returns(uint) {
        return startedAt + (getCurrentRoundNumber() * ROUND_LENGTH);
    }

    // How long until the players can still deposito on this round
    function getDepositDeadline() public view returns(uint) {
        return getNextDepositStarts();
    }

    // Is the game going
    function areWeHavingFun() public view returns(bool) {
        return now < startedAt + GAME_LENGTH;
    }

    function hasPlayerFinishedGame(address addr) public view returns(bool) {
        require(isPlayerAddress(addr), "Not a player");
        return lastRound[addr] == getLastRoundNumber();
    }

    // Have we checked all the players if they made it to the finish line
    function isCleanUpComplete() public view returns(bool) {
        return cleanedUpPlayerCount == playerCount;
    }

    // Determine in which state the game is currently,
    function getState() public view returns(GameState) {
        if(!isIncubationPeriodOver()) {
            return GameState.Starting;
        } else if(areWeHavingFun()) {
            return GameState.Playing;
        } else if(!isCleanUpComplete()) {
            return GameState.Cleaning;
        } else {
            return GameState.PayingOut;
        }
    }
}