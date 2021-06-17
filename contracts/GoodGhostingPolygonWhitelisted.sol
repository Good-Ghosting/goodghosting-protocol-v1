// SPDX-License-Identifier: UNLICENSED

pragma solidity 0.6.11;

import "./GoodGhostingPolygon.sol";
import "./MerkleDistributor.sol";

contract GoodGhostingPolygonWhitelisted is GoodGhostingPolygon, MerkleDistributor {

      /**
        Creates a new instance of GoodGhosting game
        @param _inboundCurrency Smart contract address of inbound currency used for the game.
        @param _lendingPoolAddressProvider Smart contract address of the lending pool adddress provider.
        @param _segmentCount Number of segments in the game.
        @param _segmentLength Lenght of each segment, in seconds (i.e., 180 (sec) => 3 minutes).
        @param _segmentPayment Amount of tokens each player needs to contribute per segment (i.e. 10*10**18 equals to 10 DAI - note that DAI uses 18 decimal places).
        @param _earlyWithdrawalFee Fee paid by users on early withdrawals (before the game completes). Used as an integer percentage (i.e., 10 represents 10%). Does not accept "decimal" fees like "0.5".
        @param _customFee performance fee charged by admin. Used as an integer percentage (i.e., 10 represents 10%). Does not accept "decimal" fees like "0.5".
        @param _dataProvider id for getting the data provider contract address 0x1 to be passed.
        @param _incentiveController matic reward claim contract.
        @param _matic matic token address.
        @param _merkleRoot merkle root to verify players on chain to allow only whitelisted users join.
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
        address _incentiveController,
        IERC20 _matic,
        bytes32 _merkleRoot
    )
        public
        GoodGhostingPolygon(
            _inboundCurrency,
            _lendingPoolAddressProvider,
            _segmentCount,
            _segmentLength,
            _segmentPayment,
            _earlyWithdrawalFee,
            _customFee,
            _dataProvider,
            _incentiveController,
            _matic
        )
        MerkleDistributor(_merkleRoot)
    {
      // Nothing else needed
    }

    /// @notice Allows a player to join the game
    function joinGame()
        external
        override
        whenNotPaused
    {
        revert("Whitelisting enabled - use joinGame(uint256, bytes32[])");
    }

        /// @notice Allows a player to join the game
    /// @param index Merkle proof player index
    /// @param merkleProof Merkle proof of the player
    /// @dev Cannot be called when the game is paused
    function joinGame(uint256 index, bytes32[] calldata merkleProof)
        external
        whenNotPaused
    {
      claim(index, msg.sender, true, merkleProof);
      _joinGame();
    }

}