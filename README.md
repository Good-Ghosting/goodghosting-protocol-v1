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

Compile contracts

```bash
truffle compile
```

This will pull Solidity compiled 0.5 from DockerHub and compile the smart contracts using Dockerized compiler.

