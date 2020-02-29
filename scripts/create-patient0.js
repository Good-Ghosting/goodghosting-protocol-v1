const { web3tx, toWad } = require("@decentral.ee/web3-test-helpers");
const configs = require("./configs");

module.exports = async function (callback) {
    const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    try {
        global.web3 = web3;
        const network = await web3.eth.net.getNetworkType();

        console.log("network: ", network);
        const IERC20 = artifacts.require("IERC20");
        const config = configs[network];

        const viralBankAddress = process.argv[process.argv.length - 1];
        const ViralBank = artifacts.require("ViralBank");
        const bank = await ViralBank.at(viralBankAddress);

        const token = await IERC20.at(config.token.address);
        await web3tx(token.approve, "token.approve")(bank.address, MAX_UINT256);
        await web3tx(bank.startGame, "bank.startGame")(ZERO_ADDRESS);

        callback();
    } catch (err) {
        callback(err);
    }
};
