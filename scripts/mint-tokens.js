const { web3tx, toWad } = require("@decentral.ee/web3-test-helpers");
const configs = require("./configs");

module.exports = async function (callback) {
    try {
        global.web3 = web3;
        const network = await web3.eth.net.getNetworkType();

        console.log("network: ", network);
        const SimpleMintable = artifacts.require("SimpleMintable");
        const config = configs[network];

        const token = await SimpleMintable.at(config.token.address);
        await web3tx(token.mint, "token.mint 10000")(toWad(10000));

        callback();
    } catch (err) {
        callback(err);
    }
};
