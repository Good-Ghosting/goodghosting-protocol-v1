/* global artifacts web3 */

var abi = require('ethereumjs-abi')

const SafeMathLib = artifacts.require("SafeMath");
const GoodGhostingContract = artifacts.require("GoodGhosting");
const GoodGhostingPolygonContract = artifacts.require('GoodGhosting_Polygon');
const BN = web3.utils.BN;
const { providers, deployConfigs } = require("../deploy.config");


/** @dev truffle may use network name as "kovan-fork", for example, so we need to get the correct name to be used in the configs */
function getNetworkName(network) {

    if (Object.prototype.toString.call(network) !== "[object String]") {
        throw new Error(`Invalid value type for parameter "${network}"`);
    }

    const name = network.toLowerCase();
    if (name.includes("kovan")) return "kovan";
    if (name.includes("ropsten")) return "ropsten";
    if (name.includes("mainnet")) return "mainnet";
    if (name.includes("polygon")) return "polygon";

    throw new Error(`Unsupported network "${network}"`);
}

function printSummary(
    // contract's constructor parameters
    {
        inboundCurrencyAddress,
        lendingPoolAddressProvider,
        segmentCount,
        segmentLength,
        segmentPaymentWei,
        earlyWithdrawFee,
        customFee,
        dataProviderAddress,
        merkelRoot
    },
    // additional logging info
    {
        networkName,
        selectedProvider,
        inboundCurrencySymbol,
        segmentPayment,
    }

) {
    var parameterTypes = [
        "address", // inboundCurrencyAddress
        "address", // lendingPoolAddressProvider
        "uint256", // segmentCount
        "uint256", // segmentLength
        "uint256", // segmentPaymentWei
        "uint256", // earlyWithdrawFee
        "uint256", // customFee
        "address", // dataProviderAddress
        "bytes32" // merkel root
    ];
    var parameterValues = [
        inboundCurrencyAddress,
        lendingPoolAddressProvider,
        segmentCount,
        segmentLength,
        segmentPaymentWei,
        earlyWithdrawFee,
        customFee,
        dataProviderAddress,
        merkelRoot
    ];
    var encodedParameters = abi.rawEncode(parameterTypes, parameterValues);

    console.log("\n\n\n----------------------------------------------------");
    console.log("GoogGhosting deployed with the following arguments:");
    console.log("----------------------------------------------------\n");
    console.log(`Network Name: ${networkName}`);
    console.log(`Lending Pool: ${selectedProvider}`);
    console.log(`Lending Pool Address Provider: ${lendingPoolAddressProvider}`);
    console.log(`Inbound Currency: ${inboundCurrencySymbol} at ${inboundCurrencyAddress}`);
    console.log(`Segment Count: ${segmentCount}`);
    console.log(`Segment Length: ${segmentLength} seconds`);
    console.log(`Segment Payment: ${segmentPayment} ${inboundCurrencySymbol} (${segmentPaymentWei} wei)`);
    console.log(`Early Withdrawal Fee: ${earlyWithdrawFee}%`);
    console.log(`Custom Pool Fee: ${customFee}%`);
    console.log(`Data Provider Address: ${dataProviderAddress}`);
    console.log(`Merkel Root: ${merkelRoot}`);
    console.log('\n\nConstructor Arguments ABI-Enconded:')
    console.log(encodedParameters.toString('hex'));
    console.log("\n\n\n\n");

}

function printSummaryPolygon(
    // contract's constructor parameters
    {
        inboundCurrencyAddress,
        lendingPoolAddressProvider,
        segmentCount,
        segmentLength,
        segmentPaymentWei,
        earlyWithdrawFee,
        customFee,
        dataProviderAddress,
        merkelRoot,
        incentiveController,
        router,
        wmatic,
        usdc
    },
    // additional logging info
    {
        networkName,
        selectedProvider,
        inboundCurrencySymbol,
        segmentPayment,
    }

) {
    var parameterTypes = [
        "address", // inboundCurrencyAddress
        "address", // lendingPoolAddressProvider
        "uint256", // segmentCount
        "uint256", // segmentLength
        "uint256", // segmentPaymentWei
        "uint256", // earlyWithdrawFee
        "uint256", // customFee
        "address", // dataProviderAddress
        "bytes32", // merkel root
        "address", // incentiveController
        "address", // quickswap router
        "address", // wmatic token
        "address" // usdc token
    ];
    var parameterValues = [
        inboundCurrencyAddress,
        lendingPoolAddressProvider,
        segmentCount,
        segmentLength,
        segmentPaymentWei,
        earlyWithdrawFee,
        customFee,
        dataProviderAddress,
        merkelRoot,
        incentiveController,
        router,
        wmatic,
        usdc
    ];
    var encodedParameters = abi.rawEncode(parameterTypes, parameterValues);

    console.log("\n\n\n----------------------------------------------------");
    console.log("GoogGhosting deployed with the following arguments:");
    console.log("----------------------------------------------------\n");
    console.log(`Network Name: ${networkName}`);
    console.log(`Lending Pool: ${selectedProvider}`);
    console.log(`Lending Pool Address Provider: ${lendingPoolAddressProvider}`);
    console.log(`Inbound Currency: ${inboundCurrencySymbol} at ${inboundCurrencyAddress}`);
    console.log(`Segment Count: ${segmentCount}`);
    console.log(`Segment Length: ${segmentLength} seconds`);
    console.log(`Segment Payment: ${segmentPayment} ${inboundCurrencySymbol} (${segmentPaymentWei} wei)`);
    console.log(`Early Withdrawal Fee: ${earlyWithdrawFee}%`);
    console.log(`Custom Pool Fee: ${customFee}%`);
    console.log(`Data Provider Address: ${dataProviderAddress}`);
    console.log(`Merkel Root: ${merkelRoot}`);
    console.log(`Incentive Controller: ${incentiveController}`);
    console.log(`Quickswap Router: ${router}`);
    console.log(`Matic Token: ${wmatic}`);
    console.log(`USDC Token: ${usdc}`);

    console.log('\n\nConstructor Arguments ABI-Enconded:')
    console.log(encodedParameters.toString('hex'));
    console.log("\n\n\n\n");

}

module.exports = function (deployer, network, accounts) {
    // Injects network name into process .env variable to make accessible on test suite.
    process.env.NETWORK = network;

    // Skips migration for local tests and soliditycoverage
    if (["test", "soliditycoverage"].includes(network)) return;

    deployer.then(async () => {

        const networkName = getNetworkName(network);
        const poolConfigs = providers[deployConfigs.selectedProvider.toLowerCase()][networkName];
        const lendingPoolAddressProvider = poolConfigs.lendingPoolAddressProvider;
        const inboundCurrencyAddress = poolConfigs[deployConfigs.inboundCurrencySymbol.toLowerCase()].address;
        const inboundCurrencyDecimals = poolConfigs[deployConfigs.inboundCurrencySymbol.toLowerCase()].decimals;
        const segmentPaymentWei = new BN(deployConfigs.segmentPayment).mul(new BN(10).pow(new BN(inboundCurrencyDecimals)));
        const dataProviderAddress = poolConfigs.dataProvider;
        await deployer.deploy(SafeMathLib);
        if (networkName === 'polygon') {
            const incentiveController = poolConfigs.incentiveController;
            const router = poolConfigs.router;

            const usdc = poolConfigs.usdc;
            const wmatic = poolConfigs.wmatic;
            // Deploys GoodGhostingContract
            await deployer.link(SafeMathLib, GoodGhostingPolygonContract);
            await deployer.deploy(
                GoodGhostingPolygonContract,
                inboundCurrencyAddress,
                lendingPoolAddressProvider,
                deployConfigs.segmentCount,
                deployConfigs.segmentLength,
                segmentPaymentWei,
                deployConfigs.earlyWithdrawFee,
                deployConfigs.customFee,
                dataProviderAddress,
                deployConfigs.merkelroot,
                incentiveController,
                router,
                wmatic,
                usdc
            );

            // Prints polygon deployment summary
            printSummaryPolygon(
                {
                    inboundCurrencyAddress,
                    lendingPoolAddressProvider,
                    segmentCount: deployConfigs.segmentCount,
                    segmentLength: deployConfigs.segmentLength,
                    segmentPaymentWei,
                    earlyWithdrawFee: deployConfigs.earlyWithdrawFee,
                    customFee: deployConfigs.customFee,
                    dataProviderAddress,
                    merkelRoot: deployConfigs.merkelroot,
                    incentiveController,
                    router,
                    wmatic,
                    usdc
                },
                {
                    networkName,
                    selectedProvider: deployConfigs.selectedProvider,
                    inboundCurrencySymbol: deployConfigs.inboundCurrencySymbol,
                    segmentPayment: deployConfigs.segmentPayment,
                }
            );
        } else {
            // Deploys GoodGhostingContract
            await deployer.link(SafeMathLib, GoodGhostingContract);
            await deployer.deploy(
                GoodGhostingContract,
                inboundCurrencyAddress,
                lendingPoolAddressProvider,
                deployConfigs.segmentCount,
                deployConfigs.segmentLength,
                segmentPaymentWei,
                deployConfigs.earlyWithdrawFee,
                deployConfigs.customFee,
                dataProviderAddress,
                deployConfigs.merkelroot
            );

            // Prints deployment summary
            printSummary(
                {
                    inboundCurrencyAddress,
                    lendingPoolAddressProvider,
                    segmentCount: deployConfigs.segmentCount,
                    segmentLength: deployConfigs.segmentLength,
                    segmentPaymentWei,
                    earlyWithdrawFee: deployConfigs.earlyWithdrawFee,
                    customFee: deployConfigs.customFee,
                    dataProviderAddress,
                    merkelRoot: deployConfigs.merkelroot
                },
                {
                    networkName,
                    selectedProvider: deployConfigs.selectedProvider,
                    inboundCurrencySymbol: deployConfigs.inboundCurrencySymbol,
                    segmentPayment: deployConfigs.segmentPayment,
                }
            );
        }
    });
};
