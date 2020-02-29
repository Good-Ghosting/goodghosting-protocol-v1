# Viral Saving Game

Try to save DAI 9.90 every week for one year.
Earn more interest by inviting friends.
If you drop out in the middle you lose your interest
and it is distributed to everyone who make it to the end.

## Referral system

The game makes saving viral.

* Each friend you refer gives you 10% of their interest

* Each friend of a friend gives you 1% of their interest

# How does it work

* Any deposited DAI is converted to [interest earning aDAI on Aave Protocol](https://developers.aave.com/#atokens)

* All interested is hold by the viral bank smart contract

* Interested is distributed to the players who make it at the end of the game

* You get extra interest bonus for friend referrals who you brought to the game

* Any players who drop out in the middle of game lose their interest and it is
  distributed to the players who make it to the end

# Smart contract usage

## Starting the game as a player

You need to have a referral from somebody to get in the game on the first round.

User needs to do the following to start the game

* Have 9.90 DAI balance in their wallet

* Have referring player address

* `approve()` the `ViralBank` contract for `DAI` token transfers

* Do a transaction to `startGame()`

## Playing the game

One week is one round.

Every week the user has to

* Have 9.90 DAI in their wallet

* Do a transaction to `buyInToRound()`

## Status and stats

* `getGameState()` tells you what is the current state of the game

* `getPlayerState(address)` tells if an address is playing, dropped out or successfully finished the game

* `getTotalAccuredInterest()` tells the total DAI prize pot at the moment

# Wallet integration

There is `vDAI` faux ERC-20 token.

* Add `ViralBank` address as a token in your wallet

* Token balance shows your accrued interest balance

# Internals

[Based on Drizzle box](https://www.trufflesuite.com/boxes/drizzle).

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

Then install and start the React app.

```bash
cd app
npm start
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
ViralBank.new: started
ViralBank.new: done, gas used 0x2713e2, gas price 20 Gwei
bank address 0x9Eb6a33451643A564049f6D65b077E3308717b54
$ npx truffle run --network kovan etherscan ViralBank@0x9Eb6a33451643A564049f6D65b077E3308717b54
Verifying ViralBank@0x9Eb6a33451643A564049f6D65b077E3308717b54
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
* ViralBank: https://kovan.etherscan.io/address/0x9Eb6a33451643A564049f6D65b077E3308717b54#code
* Patient 0: 0xd66E40b0c30595bEc72153B502aC1E0c4785991B
