const Web3 = require("web3");
var web3 = new Web3();
require("dotenv").config();

function getAccount() {
    return new Promise(resolve => {
        const key = process.env.CELO_PRIVATE_KEY;
        if (key) {
            resolve(web3.eth.accounts.privateKeyToAccount(key.trim()));
        } else {
            resolve("");
        }
    });
}

module.exports = {
    getAccount
};
