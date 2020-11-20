# GoodGhosting

The new addictive way to save. Our savings pools reward regular savers with higher interest rates. The more people drop out, the greater the returns for the winners!

How?
- The game is divided into segments. These can be weekly, monthly or any other duration.
- During the first segment, players can join the game by depositing a fixed amount of DAI (by calling `joinGame`)
- This DAI is transferred into the smart contract
- DAI is converted to aDAI. In other words: deposited into Aave where it accrues interest for the savings pool.
- To stay in the game, players must deposit before the end of each segment (via `makeDeposit`)
- At the end of the game, the earned interest is split amongst all players who made every deposit. Aka: the winners. 
- Players that missed a deposit, still get their principal back but do not earn any interest. 
- Users can withdraw their principal at any time, if they wish to do so (`emergencyWithdraw`)

# Tests 
To run tests:
`truffle test`

# Internals

[Based on Drizzle box](https://www.trufflesuite.com/boxes/drizzle).

## Smart Contract Overview 
Note: this is outdated. There have been a number of improvements. For instance, users are able to join from segment 0 and we use the 'The Graph' to query the game data.
![high level diagram](https://github.com/Good-Ghosting/goodghosting-smart-contracts/blob/master/smart_contract_overview_11-07-20.png?raw=true)

## Example view of the UI


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
* GoodGhosting.sol: https://kovan.etherscan.io/address/0x16D1feaC977dFb79a879BD5e5B7Ed37E81C3D660#code


## Using
* BN.js for handling Bignumbers
* Both DAI and aDAI work similarily to Wei. ie 10**18 
