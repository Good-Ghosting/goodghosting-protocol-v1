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
            wmatic: '0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270',
            dai: {
                address: "0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063",
                decimals: 18,
            }
        },
        alfajores: {
            lendingPoolAddressProvider: "0x6EAE47ccEFF3c3Ac94971704ccd25C7820121483",
            lendingPool: "0x0886f74eEEc443fBb6907fB5528B57C28E813129",
            dai: {
                address: "0x10c892a6ec43a53e45d0b916b4b7d383b1b78c0f",
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
    segmentCount: 3, // integer number of segments
    segmentLength: 600, // in seconds
    segmentPayment: 1, // amount of tokens - i.e. 10 equals to 10 TOKENS (DAI, ETH, etc.);
    earlyWithdrawFee: 10, // i.e. 10 equals to 10%
    customFee: 5, // i.e. 5 equals to 5%
    merkleroot: "0xd566243e283f1357e5e97dd0c9ab0d78177583074b440cb07815e05f615178bf" // merkle root for 1st 4 player addresses in the fork tests
};
