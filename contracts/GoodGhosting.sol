
// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./aave/ILendingPoolAddressesProvider.sol";
import "./aave/ILendingPool.sol";
import "./aave/AToken.sol";
import "./GoodGhostingWhitelisted.sol";


/// @title GoodGhosting Game Ethereum Contract
/// @author Francis Odisi & Viraz Malhotra
contract GoodGhosting is Ownable, Pausable, GoodGhostingWhitelisted {
    using SafeMath for uint256;

    // Controls if tokens were redeemed or not from the pool
    bool public redeemed;
    // Stores the total amount of interest received in the game.
    uint256 public totalGameInterest;
    //  total principal amount
    uint256 public totalGamePrincipal;

    uint256 public adminFeeAmount;

    bool public adminWithdraw;

    // Token that players use to buy in the game - DAI
    IERC20 public immutable daiToken;
    // Pointer to aDAI
    AToken public immutable adaiToken;
    // Which Aave instance we use to swap DAI to interest bearing aDAI
    ILendingPoolAddressesProvider public immutable lendingPoolAddressProvider;
    ILendingPool public lendingPool;

    uint256 public immutable segmentPayment;
    uint256 public immutable lastSegment;
    uint256 public immutable firstSegmentStart;
    uint256 public immutable segmentLength;
    uint256 public immutable earlyWithdrawalFee;
    uint256 public immutable customFee;

    struct Player {
        address addr;
        bool withdrawn;
        bool canRejoin;
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
    event EarlyWithdrawal(address indexed player, uint256 amount, uint256 totalGamePrincipal);
    event AdminWithdrawal(
        address indexed admin,
        uint256 totalGameInterest,
        uint256 adminFeeAmount
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
        @param _lendingPoolAddressProvider Smart contract address of the lending pool adddress provider.
        @param _segmentCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment (i.e. 10*10**18 equals to 10 DAI - note that DAI uses 18 decimal places).
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%).
        customFee
        @param _dataProvider id for getting the data provider contract address 0x1 to be passed.
        @param merkleRoot_ merkel root to verify players on chain to allow only whitelisted users join.
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
        bytes32 merkleRoot_
    ) GoodGhostingWhitelisted(merkleRoot_) public {
        require(_customFee <= 20);
        require(_earlyWithdrawalFee <= 10);
        require(_earlyWithdrawalFee > 0);
        // Initializes default variables
        firstSegmentStart = block.timestamp; //gets current time
        lastSegment = _segmentCount;
        segmentLength = _segmentLength;
        segmentPayment = _segmentPayment;
        earlyWithdrawalFee = _earlyWithdrawalFee;
        customFee = _customFee;
        daiToken = _inboundCurrency;
        lendingPoolAddressProvider = _lendingPoolAddressProvider;
        AaveProtocolDataProvider dataProvider = AaveProtocolDataProvider(
            _dataProvider
        );
        // lending pool needs to be approved in v2 since it is the core contract in v2 and not lending pool core
        lendingPool = ILendingPool(
            _lendingPoolAddressProvider.getLendingPool()
        );
        // atoken address in v2 is fetched from data provider contract
        (address adaiTokenAddress, , ) = dataProvider.getReserveTokensAddresses(
            address(_inboundCurrency)
        );
        // require(adaiTokenAddress != address(0), "Aave doesn't support _inboundCurrency");
        adaiToken = AToken(adaiTokenAddress);

        // Allows the lending pool to convert DAI deposited on this contract to aDAI on lending pool
        uint256 MAX_ALLOWANCE = 2**256 - 1;
        require(
            _inboundCurrency.approve(address(lendingPool), MAX_ALLOWANCE),
            "Fail to approve allowance to lending pool"
        );
    }

    /// @notice calculates number of players
    /// @return number of players
    function getNumberOfPlayers() external view returns (uint256) {
        return iterablePlayers.length;
    }

    /// @notice pause the game
    function pause() external onlyOwner whenNotPaused {
        _pause();
    }

    /// @notice unpause the game
    function unpause() external onlyOwner whenPaused {
        _unpause();
    }

    /// @notice Allows admin to withdraw fees if applicable
    function adminFeeWithdraw() external virtual  onlyOwner whenGameIsCompleted {
        require(redeemed, "Funds not redeemed from external pool");
        require(!adminWithdraw, "Admin has already withdrawn");
        require(adminFeeAmount > 0, "No Fees Earned");
        adminWithdraw = true;
        emit AdminWithdrawal(owner(), totalGameInterest, adminFeeAmount);

        require(
            IERC20(daiToken).transfer(owner(), adminFeeAmount),
            "Fail to transfer ER20 tokens to admin"
        );
    }

    /// @notice Responsible for transferring player funds each segment in the contract
    function _transferDaiToContract() internal {
        require(
            daiToken.allowance(msg.sender, address(this)) >= segmentPayment,
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
        require(
            daiToken.transferFrom(msg.sender, address(this), segmentPayment),
            "Transfer failed"
        );
    }

    /// @notice Calculates Current game segment
    /// @return current game segment
    function getCurrentSegment() public view returns (uint256) {
        return block.timestamp.sub(firstSegmentStart).div(segmentLength);
    }

    /// @notice Checks if game is completed or not
    /// @return game's status
    function isGameCompleted() public view returns (bool) {
        // Game is completed when the current segment is greater than "lastSegment" of the game.
        return getCurrentSegment() > lastSegment;
    }

    /// @notice Allows players to join the game
    /// @param index Merkel Proof Player Index
    /// @param merkleProof Merkel Proof of the player
    function joinGame(uint256 index, bytes32[] calldata merkleProof) external whenNotPaused {
        require(getCurrentSegment() == 0, "Game has already started");
        address player = msg.sender;
        claim(index, player, true, merkleProof);
        require(
            players[msg.sender].addr != msg.sender || players[msg.sender].canRejoin,
            "Cannot join the game more than once"
        );
        bool canRejoin = players[msg.sender].canRejoin;
        Player memory newPlayer = Player({
            addr: msg.sender,
            mostRecentSegmentPaid: 0,
            amountPaid: 0,
            withdrawn: false,
            canRejoin: false
        });
        players[msg.sender] = newPlayer;
        if (!canRejoin) {
            iterablePlayers.push(msg.sender);
        }
        emit JoinedGame(msg.sender, segmentPayment);
        _transferDaiToContract();
    }

    /// @notice Responsible for depositing the funds to external pool which is Aave in this case segment wise
    function depositIntoExternalPool()
        external
        whenNotPaused
        whenGameIsNotCompleted
    {
        uint256 currentSegment = getCurrentSegment();
        require(
            currentSegment > 0,
            "Cannot deposit into underlying protocol during segment zero"
        );
        uint256 amount = 0;
        for (uint i = 0; i <= currentSegment.sub(1); i++) {
            if (segmentDeposit[i] > 0) {
               amount = amount.add(segmentDeposit[i]);
               segmentDeposit[i] = 0;
            }
        }
        // balance safety check
        uint256 currentBalance = daiToken.balanceOf(address(this));
        if (amount > currentBalance) {
            amount = currentBalance;
        }
        require(
            amount > 0,
            "No amount from previous segment to deposit into protocol"
        );

        emit FundsDepositedIntoExternalPool(amount);
        lendingPool.deposit(address(daiToken), amount, address(this), 155);
    }

    /// @notice Allows a player to withdraw early in the middle of the ongoing game
    function earlyWithdraw() external whenNotPaused whenGameIsNotCompleted {
        Player storage player = players[msg.sender];
        require(player.amountPaid > 0, "Player does not exist");
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;
        // In an early withdraw, users get their principal minus the earlyWithdrawalFee % defined in the constructor.
        uint256 withdrawAmount = player.amountPaid.sub(
            player.amountPaid.mul(earlyWithdrawalFee).div(100)
        );
        // Decreases the totalGamePrincipal on earlyWithdraw
        totalGamePrincipal = totalGamePrincipal.sub(player.amountPaid);
        uint256 currentSegment = getCurrentSegment();

        if (segmentDeposit[currentSegment] > 0) {
            if (segmentDeposit[currentSegment] >= withdrawAmount) {
                segmentDeposit[currentSegment] = segmentDeposit[currentSegment]
                    .sub(withdrawAmount);
            } else {
                segmentDeposit[currentSegment] = 0;
            }
        }

        uint256 contractBalance = IERC20(daiToken).balanceOf(address(this));

        if (currentSegment == 0) {
            player.canRejoin = true;
        }

        emit EarlyWithdrawal(msg.sender, withdrawAmount, totalGamePrincipal);

        // Only withdraw funds from underlying pool if contract doesn't have enough balance to fulfill the early withdraw.
        if (contractBalance < withdrawAmount) {
            lendingPool.withdraw(
                address(daiToken),
                withdrawAmount.sub(contractBalance),
                address(this)
            );
        }
        require(
            IERC20(daiToken).transfer(msg.sender, withdrawAmount),
            "Fail to transfer ERC20 tokens on early withdraw"
        );
    }

    /// @notice Redeems Funds from the external aave pool
    function redeemFromExternalPool() public virtual whenGameIsCompleted {
        require(!redeemed, "Redeem operation already happened for the game");
        redeemed = true;
        if (adaiToken.balanceOf(address(this)) > 0) {
            lendingPool.withdraw(
                address(daiToken),
                type(uint256).max,
                address(this)
            );
        }
        uint256 totalBalance = IERC20(daiToken).balanceOf(address(this));
        // recording principal amount separately since adai balance will have interest has well
        uint256 grossInterest = totalBalance.sub(totalGamePrincipal);
        uint256 _adminFeeAmount;
        if (customFee > 0) {
            _adminFeeAmount = (grossInterest.mul(customFee)).div(100);
            totalGameInterest = grossInterest.sub(_adminFeeAmount);
        } else {
            _adminFeeAmount = 0;
            totalGameInterest = grossInterest;
        }

        if (winners.length == 0) {
            adminFeeAmount = grossInterest;
        } else {
            adminFeeAmount = _adminFeeAmount;
        }

        emit FundsRedeemedFromExternalPool(
            totalBalance,
            totalGamePrincipal,
            totalGameInterest
        );
        emit WinnersAnnouncement(winners);
    }

    /// @notice Allows all the players to withdraw the funds, winners get a share of interest
    function withdraw() external virtual {
        Player storage player = players[msg.sender];
        require(player.amountPaid > 0, "Player does not exist");
        require(!player.withdrawn, "Player has already withdrawn");
        player.withdrawn = true;

        uint256 payout = player.amountPaid;
        if (player.mostRecentSegmentPaid == lastSegment.sub(1)) {
            // Player is a winner and gets a bonus!
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
    }

    /// @notice Allows players to make deposits after they join the game
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
        _transferDaiToContract();
    }
}
