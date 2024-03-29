module.exports = {
    copyPackages: ['@openzeppelin/contracts'],
    providerOptions: {
        // using a default mnemonic since the join game method has merkle root params
        mnemonic: 'clutchaptain shoe salt awake harvest setup primary inmate ugly among become'
      },
    skipFiles: [
        'Migrations.sol',
        'mock/LendingPoolAddressesProviderMock.sol',
        'mock/SimpleMintable.sol',
        'mock/TestBundle.sol',
        'mock/ERC20Mintable.sol',
        'mock/ForceSend.sol',
        'mock/MockCurvePool.sol',
        'mock/MockCurveGauge.sol',
        'mock/IncentiveControllerMock.sol',
        'aave/AToken.sol',
        'aave/ILendingPool.sol',
        'aave/ILendingPoolAddressesProvider.sol',
        'aave/IncentiveController.sol',
        'aave/ADaiTokenWrapper.sol',
        'curve/ICurveGauge.sol',
        'curve/ICurvePool.sol',
        'GoodGhostingCelo.sol',
        'GoodGhosting_Polygon_Quickswap.sol',
        'batched/GoodGhostingBatched',
        'batched/GoodGhostingPolygonBatched',
        'utils/Math.sol'
    ]
};
