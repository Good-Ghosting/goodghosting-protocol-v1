pragma solidity 0.6.11;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ERC20Mintable.sol";

contract MockCurveGauge is MockERC20Mintable {
    IERC20 public reserve;
    IERC20 public polygonRewardToken;
    IERC20 public curve;

    constructor(
        string memory name,
        string memory symbol,
        IERC20 _curve,
        IERC20 _reserve,
        IERC20 _polygonRewardToken // mock wmatic
    ) MockERC20Mintable(name, symbol) public {
        curve = _curve;
        reserve = _reserve;
        polygonRewardToken = _polygonRewardToken;
    }

    function deposit(
        uint256 _value
    ) external {
        _mint(msg.sender, _value / 2);
        reserve.transferFrom(msg.sender, address(this), _value);
    }

    function withdraw(uint256 _value, bool _claim_rewards) external {
        _burn(msg.sender, _value);
        uint256 _amount = reserve.balanceOf(address(this));
        if (_claim_rewards) {
            polygonRewardToken.transfer(msg.sender, polygonRewardToken.balanceOf(address(this)));
            curve.transfer(msg.sender, curve.balanceOf(address(this)));
        }
        reserve.transfer(msg.sender, _amount);
    }
}
