
[![Build Status](https://travis-ci.org/ngmachado/viral-aave-save-game.svg?branch=master)](https://travis-ci.org/ngmachado/viral-aave-save-game) [![Coverage Status](https://coveralls.io/repos/github/ngmachado/viral-aave-save-game/badge.svg?branch=master)](https://coveralls.io/github/ngmachado/viral-aave-save-game?branch=master)

# GoodGhosting

- The game is divided up in to segments these can be weekly, monthly or any other time unit.
- Users must register to play 
- Firt segement of the game users can join and pay in 
- Users pay in to the smart contract with Dai
- Dai is converted to aDai
- The amount paid in is recorded in the players struct

To run tests:
`truffle test`

# Internals

[Based on Drizzle box](https://www.trufflesuite.com/boxes/drizzle).

## Smart Contract Overview
![high level diagram](https://github.com/Good-Ghosting/goodghosting-smart-contracts/blob/master/smart_contract_overview_11-07-20.png?raw=true)


# Developing

Install Truffle.

```bash
npm install -g truffle
```

Install Ganache for having a local dev Ethereum network.

```bash
npm install -g ganache ganache-cli
```

Compile contracts

```bash
truffle compile
```

This will pull Solidity compiled 0.5 from DockerHub and compile the smart contracts using Dockerized compiler.

Start dev env in one terminal

```bash
truffle develop
```

## Deploying contracts to Ethereum Networks
The project uses [Infura](https://https://infura.io/) to deploy smart contracts to Ethereum networks (testnets and mainnet). What you'll need:
- SignIn/SignUp at Infura, create a project and get the project id.
- Your wallet mnemonic (12 words seed).

**Steps**
1. Copy [.env.sample](./.env.sample) as an `.env` file. You can run this command in your terminal: `cp .env.sample .env`
2. Open file `.env`
3. Insert your Infura's ProjectId and your wallet mnemonic in the file for the desired network
4. Open the file [deploy.config.js](./deploy.config.js) and set the desired deployment configs for the contract.
5. Once you have the `.env` and `deploy.config.js` files properly setup, you can deploy the GoodGhosting contract to the desired network by running one of the following commands:
- Deploy to kovan: `npm run deploy:kovan`
- Deploy to ropsten: `npm run deploy:ropsten`
- Deploy to mainnet (PRODUCTION): `npm run deploy:mainnet`


## Addresses

**Kovan**

* DAI: https://kovan.etherscan.io/address/0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD
* aDAI: https://kovan.etherscan.io/address/0x58AD4cB396411B691A9AAb6F74545b2C5217FE6a
* GoodGhosting: https://kovan.etherscan.io/address/0x9Eb6a33451643A564049f6D65b077E3308717b54#code
* Patient 0: 0xd66E40b0c30595bEc72153B502aC1E0c4785991B


## Using
* BN.js for handling Bignumbers
* Both DAI and ADAI work similarily to Wei. ie 10**18 
