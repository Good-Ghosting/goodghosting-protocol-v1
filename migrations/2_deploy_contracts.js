/* global artifacts web3 */

const SafeMathLib = artifacts.require("SafeMath");
const GoodGhostingContract = artifacts.require("GoodGhosting");

const BN = web3.utils.BN;
const {providers, deployConfigs} = require("../deploy.config");


/** @dev truffle may use network name as "kovan-fork", for example, so we need to get the correct name to be used in the configs */
function getNetworkName(network) {
    
    if (Object.prototype.toString.call(network) !== "[object String]") {
        throw new Error(`Invalid value type for parameter "${network}"`);
    }

    const name = network.toLowerCase();
    if (name.includes("kovan")) return "kovan";
    if (name.includes("ropsten")) return "ropsten";
    if (name.includes("mainnet")) return "mainnet";

    throw new Error(`Unsupported network "${network}"`);
}

module.exports = function(deployer, network, accounts) {
    // Skips migration for local tests and soliditycoverage
    if (["test", "soliditycoverage"].includes(network)) return;

    deployer.then(async () => {
        
        const poolConfigs = providers[deployConfigs.selectedProvider.toLowerCase()][getNetworkName(network)];
        const lendingPoolAddressProvider = poolConfigs.lendingPoolAddressProvider;
        const inboundCurrencyAddress = poolConfigs[deployConfigs.inboundCurrencySymbol.toLowerCase()].address;
        const inboundCurrencyDecimals = poolConfigs[deployConfigs.inboundCurrencySymbol.toLowerCase()].decimals;
        const segmentPaymentWei = new BN(deployConfigs.segmentPayment).mul(new BN(10).pow(new BN(inboundCurrencyDecimals)));


        console.log("---------------------------------------------------");
        console.log("Deploying GoogGhosting with the following parameters:");
        console.log("---------------------------------------------------");
        console.log(`Lending Pool: ${deployConfigs.selectedProvider}`);
        console.log(`Lending Pool Address Provider: ${lendingPoolAddressProvider}`);
        console.log(`Inbound Currency: ${deployConfigs.inboundCurrencySymbol} at ${inboundCurrencyAddress}`);
        console.log(`Early Withdrawal Fee: ${deployConfigs.earlyWithdrawFee}%`);
        console.log(`Segment Count: ${deployConfigs.segmentCount}`);
        console.log(`Segment Length: ${deployConfigs.segmentLength} seconds`);
        console.log(`Segment Payment: ${deployConfigs.segmentPayment} ${deployConfigs.inboundCurrencySymbol} (${segmentPaymentWei} wei)`);
        console.log("---------------------------------------------------\n\n\n");

        // Deploys GoodGhostingContract
        await deployer.deploy(SafeMathLib);
        await deployer.link(SafeMathLib, GoodGhostingContract);
        await deployer.deploy(
            GoodGhostingContract,
            inboundCurrencyAddress,
            lendingPoolAddressProvider,
            deployConfigs.segmentCount,
            deployConfigs.segmentLength,
            segmentPaymentWei,
            deployConfigs.earlyWithdrawFee,
        );
    });
};