pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Play the save game
contract ViralBank {

    // Token that patients use to buy in the game - DAI
    IERC20 public inboundCurrency;

    // Pointer to aDAI
    IERC20 public interestCurrency;

    // What is the monthly payment and buy in
    // Now 9.90 DAI
    uint public ticketSize = 9.90 * 10**18;

    // How many players
    uint public playerCount = 0;

    // When the game startd
    uint public startedAt = now;

    // How long we want to play
    uint public constant INCUBATION_PERIOD = 30 days;
    uint public constant ROUND_LENGTH = 30 days;
    uint public constant GAME_LENGTH = 12 * 30 days;

    // Book keeping
    mapping(address => uint) public balances;
    uint public raisedMoney;

    // Track if the player has been keeping up with the game
    mapping(address => uint) public lastActivityAt;

    constructor(IERC20 _inboundCurrency) public {
        inboundCurrency = _inboundCurrency;
    }

    function startGame(address referral) public {

        require(!isIncubationPeriodOver(), "Cannot come in after the pets have left the lab");

        if(playerCount == 0) {
            // Patient zero
            require(referral == address(0), "Patient zero has no referral");
        } else {
            require(referral != address(0), "All players must have a referral");
            require(isValidPlayer(referral), "Dead players cannot refer");
        }

        inboundCurrency.transferFrom(msg.sender, address(this), ticketSize);
        playerCount++;
        raisedMoney += ticketSize;
        lastActivityAt[msg.sender] = now;
    }

    // Cannot come in after incubation perios is over
    function isIncubationPeriodOver() public view returns(bool) {
        return now > startedAt + INCUBATION_PERIOD;
    }

    /** The player has started the game and has not dropped out */
    function isValidPlayer(address addr) public returns(bool) {

    }

    // Zero for the incubation, 12 is when the game ends
    function getRoundNumber() public returns(uint) {
    }

    // When the next round of deposits needs to get in,
    function getNextDepositStarts() public returns(uint) {
    }

    // How long until the players can still deposito on this round
    function getDepositDeadline() public returns(uint) {
    }

    // Is the game going
    function areWeHavingFun() public returns(bool) {
    }

}