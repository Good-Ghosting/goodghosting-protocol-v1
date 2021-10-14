pragma solidity 0.6.11;

interface ICurveGauge {
    function deposit(
        uint256 _value,
        address _addr,
        bool _claim_rewards
    ) external;

    function withdraw(uint256 _value, bool _claim_rewards) external;

    function balanceOf(address user) external view returns (uint256);
}
