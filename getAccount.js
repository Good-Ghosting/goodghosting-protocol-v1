const Web3 = require('web3')
const fs = require('fs')
const path = require('path')
var web3 = new Web3()
require("dotenv").config();

function getAccount() {
    return new Promise(resolve => {
                const key = process.env.CELO_PRIVATE_KEY
                resolve(web3.eth.accounts.privateKeyToAccount(key.trim()))
})
}

module.exports = {
    getAccount
}
