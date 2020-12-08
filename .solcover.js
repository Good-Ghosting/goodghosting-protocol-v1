module.exports = {
    copyPackages: ['@openzeppelin/contracts'],
    skipFiles: [
        'Migrations.sol',
        'mock/LendingPoolAddressesProviderMock.sol',
        'mock/SimpleMintable.sol',
        'mock/TestBundle.sol',
        'mock/ERC20Mintable.sol',
        'aave/AToken.sol',
        'aave/ILendingPool.sol',
        'aave/ILendingPoolAddressesProvider.sol',
    ]
};
