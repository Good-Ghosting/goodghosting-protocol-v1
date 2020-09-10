
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


## Addresses

**Kovan**

* DAI: https://kovan.etherscan.io/address/0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD
* aDAI: https://kovan.etherscan.io/address/0x58AD4cB396411B691A9AAb6F74545b2C5217FE6a
* GoodGhosting: https://kovan.etherscan.io/address/0x9Eb6a33451643A564049f6D65b077E3308717b54#code
* Patient 0: 0xd66E40b0c30595bEc72153B502aC1E0c4785991B


## Using
* BN.js for handling Bignumbers
* Both DAI and ADAI work similarily to Wei. ie 10**18 
