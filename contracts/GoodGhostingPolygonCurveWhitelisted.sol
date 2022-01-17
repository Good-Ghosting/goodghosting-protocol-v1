// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

import "./GoodGhostingPolygonCurve.sol";
import "./MerkleDistributor.sol";

contract GoodGhostingPolygonCurveWhitelisted is GoodGhostingPolygonCurve, MerkleDistributor {

      /**
        Creates a new instance of GoodGhosting Whitelisted game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _pool Smart contract address of the curve pool.
        @param _inboundTokenIndex token index in int form.
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
        @param _merkleRoot merkle root to verify players on chain to allow only whitelisted users join.
     */
    constructor(
        IERC20 _inboundCurrency,
        ICurvePool _pool,
        int128 _inboundTokenIndex,
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
        IERC20 _incentiveToken,
        bytes32 _merkleRoot
    )
        public
        GoodGhostingPolygonCurve(
            _inboundCurrency,
            _pool,
            _inboundTokenIndex,
            _poolType,
            _gauge,
            _segmentCount,
            _segmentLength,
            _segmentPayment,
            _earlyWithdrawalFee,
            _customFee,
            _maxPlayersCount,
            _curve,
            _matic,
            _incentiveToken            
        )
        MerkleDistributor(_merkleRoot)
    {
      // Nothing else needed
    }

    /// @notice Does not allow users to join. Must use "joinWhitelistedGame instead.
    /// @dev Must override function from parent contract (GoodGhosting.sol) and revert to enforce whitelisting.
    function joinGame(uint256 _minAmount)
        external
        override
        whenNotPaused
    {
        revert("Whitelisting enabled - use joinWhitelistedGame(uint256, bytes32[], uint256) instead");
    }

    /// @notice Allows a whitelisted player to join the game.
    /// @param index Merkle proof player index
    /// @param merkleProof Merkle proof of the player
    /// @dev Cannot be called when the game is paused. Different function name to avoid confusion (instead of overloading "joinGame")
    function joinWhitelistedGame(uint256 index, bytes32[] calldata merkleProof, uint256 _minAmount)
        external
        whenNotPaused
    {
      claim(index, msg.sender, true, merkleProof);
      _joinGame(_minAmount);
    }

}
