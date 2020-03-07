pragma solidity ^0.5.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ILendingPoolAddressesProvider } from "../../aave/ILendingPoolAddressesProvider.sol";
import { ILendingPool } from "../../aave/ILendingPool.sol";

contract LendingPoolAddressesProviderMock
    is ILendingPoolAddressesProvider, ILendingPool, ERC20 {

    address public underlyingAssetAddress;

    /// ILendingPoolAddressesProvider interface
    function getLendingPool() public view returns (address) {
        return address(this);
    }

    function setLendingPoolImpl(address _pool) public {

    }

    function getLendingPoolCore() public view returns (address payable) {
        return address(uint160(address(this))); // cast to make it payalbe
    }

    function setLendingPoolCoreImpl(address _lendingPoolCore) public {

    }

    function getLendingPoolConfigurator() public view returns (address) {

    }
    function setLendingPoolConfiguratorImpl(address _configurator) public {

    }

    function getLendingPoolDataProvider() public view returns (address) {

    }
    function setLendingPoolDataProviderImpl(address _provider) public {

    }

    function getLendingPoolParametersProvider() public view returns (address) {

    }
    function setLendingPoolParametersProviderImpl(address _parametersProvider) public {

    }

    function getTokenDistributor() public view returns (address) {

    }
    function setTokenDistributor(address _tokenDistributor) public {

    }


    function getFeeProvider() public view returns (address) {

    }
    function setFeeProviderImpl(address _feeProvider) public {

    }

    function getLendingPoolLiquidationManager() public view returns (address) {

    }
    function setLendingPoolLiquidationManager(address _manager) public {

    }

    function getLendingPoolManager() public view returns (address) {

    }
    function setLendingPoolManager(address _lendingPoolManager) public {

    }

    function getPriceOracle() public view returns (address) {

    }
    function setPriceOracle(address _priceOracle) public {

    }

    function getLendingRateOracle() public view returns (address) {

    }
    function setLendingRateOracle(address _lendingRateOracle) public {

    }

    /// ILendingPool interface
    function deposit(address _reserve, uint256 _amount, uint16 _referralCode) public {
        IERC20 reserve = IERC20(_reserve);
        reserve.transferFrom(msg.sender, address(this), _amount);
        _mint(msg.sender, _amount);
    }

    function redeem(uint256 _amount) public {
        _burn(msg.sender, _amount);
        IERC20(underlyingAssetAddress).transfer(msg.sender, _amount);
    }

    //Helpers
    //We need to bootstrap the underlyingAssetAddress to use the redeem function
    function setUnderlyingAssetAddress(address _addr) public {
        underlyingAssetAddress = _addr;
    }

    //We need to bootstrap the pool with liquidity to pay interest
    function addLiquidity(address _reserve, address _addr, uint256 _amount) public {
        IERC20 reserve = IERC20(_reserve);
        reserve.transferFrom(_addr, address(this), _amount);
    }
}
