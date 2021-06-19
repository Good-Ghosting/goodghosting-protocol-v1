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
        'mock/IncentiveControllerMock.sol',
        'aave/AToken.sol',
        'aave/ILendingPool.sol',
        'aave/ILendingPoolAddressesProvider.sol',
        'GoodGhostingCelo.sol',
        'GoodGhosting_Polygon_Quickswap.sol',
        'batched/GoodGhostingBatched',
        'GoodGhostingPolygonBatched',
        'utils/Math.sol'
    ]
};
