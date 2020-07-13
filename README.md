
[![Build Status](https://travis-ci.org/ngmachado/viral-aave-save-game.svg?branch=master)](https://travis-ci.org/ngmachado/viral-aave-save-game) [![Coverage Status](https://coveralls.io/repos/github/ngmachado/viral-aave-save-game/badge.svg?branch=master)](https://coveralls.io/github/ngmachado/viral-aave-save-game?branch=master)

# GoodGhosting

- The game is divided up in to segments (currently hard coded to be a week long x 16), will likely be switched to a segment length of a month
- Users must register to play 
- Firt segement of the game is a holding segment. This is for participants to join, but no payments can be made
- Users pay in to the smart contract with Dai
- Dai is converted to aDai
- The amount paid in is recorded in the players struct
*the rest to be continued*

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



# Deployment

First setup .env file:

```
KOVAN_MNEMONIC="xxx yyy"
KOVAN_PROVIDER_URL=https://kovan.infura.io/v3/your_key

MAINNET_MNEMONIC="xxx yyy"
MAINNET_PROVIDER_URL=https://mainnet.infura.io/v3/your_key
MAINNET_GAS_PRICE=3000000000

# you can get this from etherscan website
ETHERSCAN_API_KEY=your_key
```

To deploy and verify the code
```
$ npx truffle --network kovan exec scripts/deploy.js
Using network 'kovan'.

network:  kovan
GoodGhosting.new: started
GoodGhosting.new: done, gas used 0x2713e2, gas price 20 Gwei
bank address 0x9Eb6a33451643A564049f6D65b077E3308717b54
$ npx truffle run --network kovan etherscan GoodGhosting@0x9Eb6a33451643A564049f6D65b077E3308717b54
Verifying GoodGhosting@0x9Eb6a33451643A564049f6D65b077E3308717b54
Pass - Verified: https://kovan.etherscan.io/address/0x9Eb6a33451643A564049f6D65b077E3308717b54#contracts
Successfully verified 1 contract(s).
```

## Mint test tokens

```
master $ npx truffle --network kovan exec scripts/mint-tokens.js
Using network 'kovan'.

network:  kovan
token.mint 100: started
token.mint 100: done, gas used 50436, gas price 20 Gwei
```

## Addresses

**Kovan**

* DAI: https://kovan.etherscan.io/address/0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD
* aDAI: https://kovan.etherscan.io/address/0x58AD4cB396411B691A9AAb6F74545b2C5217FE6a
* GoodGhosting: https://kovan.etherscan.io/address/0x9Eb6a33451643A564049f6D65b077E3308717b54#code
* Patient 0: 0xd66E40b0c30595bEc72153B502aC1E0c4785991B
