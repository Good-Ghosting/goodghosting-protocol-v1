/* global artifacts web3 */

var abi = require("ethereumjs-abi");

const SafeMathLib = artifacts.require("SafeMath");
const GoodGhostingContract = artifacts.require("GoodGhosting");
const GoodGhostingPolygonContract = artifacts.require("GoodGhostingPolygon");
const GoodGhostingPolygonCurveContract = artifacts.require("GoodGhostingPolygonCurve");
const GoodGhostingPolygonWhitelisted = artifacts.require("GoodGhostingPolygonWhitelisted");
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
    if (name.includes("polygon-vigil-fork-curve")) return "polygon-curve";
    if (name.includes("polygon")) return "polygon";
    if (name.includes("alfajores")) return "alfajores";
    if (name.includes("celo")) return "celo";

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
        aaveContractAddress,
        maxPlayersCount,
        incentiveToken,
        incentiveController,
        wmatic,
        merkleRoot,
        curve,
        curvePool,
        curvePoolTokenIndex,
        curveGauge,
        curvePoolType
    },
    // additional logging info
    {
        networkName,
        selectedProvider,
        inboundCurrencySymbol,
        segmentPayment,
        owner,
    }

) {
    const isPolygon = networkName.toLowerCase() === "polygon";
    const isPolygonCurve = networkName.toLowerCase() === "polygon-curve";
    const isPolygonWhitelisted = networkName.toLowerCase() === "polygon-whitelisted" || ["polygon-whitelisted"].includes(networkName.toLowerCase()); // for local network

    var parameterTypes = [
        "address", // inboundCurrencyAddress
        "address", // lendingPoolAddressProvider
        "uint256", // segmentCount
        "uint256", // segmentLength
        "uint256", // segmentPaymentWei
        "uint256", // earlyWithdrawFee
        "uint256", // customFee
        "address", // dataProvider/lending pool address
        "uint256", // maxPlayersCount
        "address" // incentiveToken
    ];
    var parameterValues = [
        inboundCurrencyAddress,
        lendingPoolAddressProvider,
        segmentCount,
        segmentLength,
        segmentPaymentWei,
        earlyWithdrawFee,
        customFee,
        aaveContractAddress,
        maxPlayersCount,
        incentiveToken
    ];

    if (isPolygon) {
        parameterTypes.push(
            "address", // IncentiveController
            "address" // wmatic token
        );
        parameterValues.push(
            incentiveController,
            wmatic
        );
    }

    if (isPolygonCurve) {
        parameterTypes = [
            "address",
            "address",
            "int128",
            "uint256",
            "uint256",
            "address",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "uint256",
            "address", 
            "address",
            "address"
        ]

        parameterValues = [
            inboundCurrencyAddress,
            curvePool,
            curvePoolTokenIndex,
            curvePoolTokenIndex,
            curvePoolType,
            curveGauge,
            segmentCount,
            segmentLength,
            segmentPaymentWei,
            earlyWithdrawFee,
            customFee,
            maxPlayersCount,
            curve,
            wmatic,
            incentiveToken
        ]
    }

    if (isPolygonWhitelisted) {
        parameterTypes.push(
            "address", // IncentiveController
            "address", // wmatic token
            "bytes32" // merkle root
        );
        parameterValues.push(
            incentiveController,
            wmatic,
            merkleRoot
        );
    }

    var encodedParameters = abi.rawEncode(parameterTypes, parameterValues);

    console.log("\n\n\n----------------------------------------------------");
    console.log("GoogGhosting deployed with the following arguments:");
    console.log("----------------------------------------------------\n");
    console.log(`Network Name: ${networkName}`);
    console.log(`Contract's Owner: ${owner}`);
    if (!isPolygonCurve) {
        console.log(`Lending Pool: ${selectedProvider}`);
        console.log(`Lending Pool Address Provider: ${lendingPoolAddressProvider}`);
        console.log(`Data Provider/Lending Pool Address: ${aaveContractAddress}`);
    }

    console.log(`Inbound Currency: ${inboundCurrencySymbol} at ${inboundCurrencyAddress}`);
    console.log(`Segment Count: ${segmentCount}`);
    console.log(`Segment Length: ${segmentLength} seconds`);
    console.log(`Segment Payment: ${segmentPayment} ${inboundCurrencySymbol} (${segmentPaymentWei} wei)`);
    console.log(`Early Withdrawal Fee: ${earlyWithdrawFee}%`);
    console.log(`Custom Pool Fee: ${customFee}%`);
    console.log(`Max Quantity of Players: ${maxPlayersCount}`);
    console.log(`Incentive Token: ${incentiveToken}`);
    if (isPolygon) {
        console.log(`Incentive Controller: ${incentiveController}`);
        console.log(`Matic Token: ${wmatic}`);
    }
    if (isPolygonWhitelisted) {
        console.log(`Incentive Controller: ${incentiveController}`);
        console.log(`Matic Token: ${wmatic}`);
        console.log(`Merkle Root: ${merkleRoot}`);
    }
    if (isPolygonCurve) {
        console.log(`Curve Pool: ${curvePool}`);
        console.log(`Curve Pool Type: ${curvePoolType}`);
        console.log(`Curve Gauge: ${curveGauge}`);
        console.log(`Curve Deposit Token Index: ${curvePoolTokenIndex}`);
        console.log(`Curve Token: ${curve}`);
        console.log(`Matic Token: ${wmatic}`);
    }
    console.log("\n\nConstructor Arguments ABI-Encoded:");
    console.log(encodedParameters.toString("hex"));
    console.log("\n\n\n\n");

}

module.exports = function (deployer, network, accounts) {
    // Injects network name into process .env variable to make accessible on test suite.
    process.env.NETWORK = network;

    // Skips migration for local tests and soliditycoverage
    if (["test", "soliditycoverage"].includes(network)) return;

    deployer.then(async () => {
        let networkName = getNetworkName(network);
        const poolConfigs = providers[deployConfigs.selectedProvider.toLowerCase()][networkName];
        const lendingPoolAddressProvider = poolConfigs.lendingPoolAddressProvider;
        const inboundCurrencyAddress = poolConfigs[deployConfigs.inboundCurrencySymbol.toLowerCase()].address;
        const inboundCurrencyDecimals = poolConfigs[deployConfigs.inboundCurrencySymbol.toLowerCase()].decimals;
        const segmentPaymentWei = (deployConfigs.segmentPayment * 10 ** inboundCurrencyDecimals).toString();
        const incentiveController = poolConfigs.incentiveController;
        const wmatic = poolConfigs.wmatic;
        const maxPlayersCount = deployConfigs.maxPlayersCount;
        const incentiveToken = poolConfigs.incentiveToken;
        let aaveContractAddress = poolConfigs.dataProvider;
        let goodGhostingContract = GoodGhostingContract; // defaults to Ethereum version
        if (network.includes("polygon-whitelisted")) {
            networkName = "polygon-whitelisted";
        }
        if (networkName === "polygon") {
            goodGhostingContract = GoodGhostingPolygonContract;
        } else if (networkName === "polygon-whitelisted") {
            goodGhostingContract = GoodGhostingPolygonWhitelisted;
        } else if (networkName === 'polygon-curve') {
            goodGhostingContract = GoodGhostingPolygonCurveContract;
        }

        // Prepares deployment arguments
        let deploymentArgs = [
            goodGhostingContract,
            inboundCurrencyAddress,
            lendingPoolAddressProvider,
            deployConfigs.segmentCount,
            deployConfigs.segmentLength,
            segmentPaymentWei,
            deployConfigs.earlyWithdrawFee,
            deployConfigs.customFee,
            aaveContractAddress,
            maxPlayersCount,
            incentiveToken
        ];
        if (networkName === "polygon") {
            deploymentArgs.push(
                incentiveController,
                wmatic
            );
        } else if (networkName === "polygon-whitelisted") {
            deploymentArgs.push(
                incentiveController,
                wmatic,
                deployConfigs.merkleroot
            );
        } else if (networkName === "polygon-curve") {
            deploymentArgs = [
                goodGhostingContract,
                inboundCurrencyAddress,
                poolConfigs.pool,
                poolConfigs.tokenIndex,
                poolConfigs.tokenIndex,
                poolConfigs.poolType,
                poolConfigs.gauge,
                deployConfigs.segmentCount,
                deployConfigs.segmentLength,
                segmentPaymentWei,
                deployConfigs.earlyWithdrawFee,
                deployConfigs.customFee,
                maxPlayersCount,
                poolConfigs.curve,
                wmatic,
                incentiveToken
            ];
        }

        // Deploys GoodGhosting contract based on network
        await deployer.deploy(SafeMathLib);
        await deployer.link(SafeMathLib, goodGhostingContract);
        await deployer.deploy(...deploymentArgs);

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
                aaveContractAddress,
                maxPlayersCount,
                incentiveToken,
                incentiveController,
                wmatic,
                merkleRoot: deployConfigs.merkleroot,
                curve: poolConfigs.curve,
                curvePool: poolConfigs.pool,
                curvePoolTokenIndex: poolConfigs.tokenIndex,
                curveGauge: poolConfigs.gauge,
                curvePoolType: poolConfigs.poolType
            },
            {
                networkName,
                selectedProvider: deployConfigs.selectedProvider,
                inboundCurrencySymbol: deployConfigs.inboundCurrencySymbol,
                segmentPayment: deployConfigs.segmentPayment,
                owner: accounts[0],
            }
        );
    });
};
