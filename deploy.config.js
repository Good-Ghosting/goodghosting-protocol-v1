/**
 * Deployment configs for supported lending providers and networks
 *
 * Aave
 * Addresses available at https://docs.aave.com/developers/deployed-contracts (v2) & https://docs.aave.com/developers/deployed-contracts/deployed-contract-instances (v1)
 *
*/

exports.providers = {
    aave: {
        kovan: {
            lendingPoolAddressProvider: "0x88757f2f99175387ab4c6a4b3067c77a695b0349",
            dataProvider: "0x3c73a5e5785cac854d468f727c606c07488a29d6",
            dai: {
                address: "0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD",
                decimals: 18,
            },
        },
        polygon: {
            lendingPoolAddressProvider: "0xd05e3E715d945B59290df0ae8eF85c1BdB684744",
            dataProvider: "0x7551b5D2763519d4e37e8B81929D336De671d46d",
            incentiveController: '0x357D51124f59836DeD84c8a1730D72B749d8BC23',
            router: '0xa5E0829CaCEd8fFDD4De3c43696c57F7D7A678ff',
            usdc: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
            wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            dai: {
                address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
                decimals: 18,
            }
        },
        ropsten: {
            lendingPoolAddressProvider: "0x1c8756FD2B28e9426CDBDcC7E3c4d64fa9A54728",   /* Note: Ropsten depreciated in Aave v2 */
            dai: {                                                                      /* Note: Ropsten depreciated in Aave v2 */
                address: "0xf80A32A835F79D7787E8a8ee5721D0fEaFd78108",                  /* Note: Ropsten depreciated in Aave v2 */
                decimals: 18,
            },
        },
        mainnet: {
            lendingPoolAddressProvider: "0xB53C1a33016B2DC2fF3653530bfF1848a515c8c5",
            dataProvider: "0x057835Ad21a177dbdd3090bB1CAE03EaCF78Fc6d",
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
    segmentCount: 4, // integer number of segments
    segmentLength: 180, // in seconds
    segmentPayment: 10, // amount of tokens - i.e. 10 equals to 10 TOKENS (DAI, ETH, etc.);
    earlyWithdrawFee: 10, // i.e. 10 equals to 10%
    customFee: 5, // i.e. 5 equals to 5%
    merkelroot: "0xaf9ec78ae1cc0ec06c83826972ff8e75377ed51e224750bff4f796a13dc438f5" // merkel root for 1st 4 player addresses in the fork tests
};
