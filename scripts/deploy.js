const { web3tx } = require("@decentral.ee/web3-test-helpers");

const configs = {
    kovan: {
        token: {
            address: "0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD",
        },
        aToken: {
            address: "0x58AD4cB396411B691A9AAb6F74545b2C5217FE6a",
        },
        pap: {
            address: "0x506B0B2CF20FAA8f38a4E2B524EE43e1f4458Cc5",
        },
    }
};

module.exports = async function (callback) {
    try {
        global.web3 = web3;
        const network = await web3.eth.net.getNetworkType();

        console.log("network: ", network);
        const ViralBank = artifacts.require("ViralBank");
        const config = configs[network];

        bank = await web3tx(ViralBank.new, "ViralBank.new")(
            config.token.address,
            config.aToken.address,
            config.pap.address);
        console.log("bank address", bank.address);

        callback();
    } catch (err) {
        callback(err);
    }
}
