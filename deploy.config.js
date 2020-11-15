/**
 * Deployment configs for supported lending providers and networks
 * 
 * Aave
 * Addresses available at https://docs.aave.com/developers/deployed-contracts/deployed-contract-instances
 * 
*/

exports.providers = {
    aave: {
        kovan: {
            lendingPoolAddressProvider: "0x506B0B2CF20FAA8f38a4E2B524EE43e1f4458Cc5",
            dai: {
                address: "0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD",
                decimals: 18,
            },
        },
        ropsten: {
            lendingPoolAddressProvider: "0x1c8756FD2B28e9426CDBDcC7E3c4d64fa9A54728",
            dai: {
                address: "0xf80A32A835F79D7787E8a8ee5721D0fEaFd78108",
                decimals: 18,
            },
        },
        mainnet: {
            lendingPoolAddressProvider: "0x24a42fD28C976A61Df5D00D0599C34c4f90748c8",
            dai: {
                address: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
                decimals: 18,
            },
        },
    }
};

exports.deployConfigs = {
    selectedProvider: "aave", // name of the selected provider. Must be defined in the object {providers} above.
    inboundCurrencySymbol: "dai", // name of the inbound currency symbol. Must be defined in the object {providers.network} above.
    segmentCount: 6, // integer number of segments
    segmentLength: 180, // in seconds
    segmentPayment: 10, // amount of tokens - i.e. 10 equals to 10 TOKENS (DAI, ETH, etc.);
    earlyWithdrawFee: 10, // i.e. 10 equals to 10%
};
