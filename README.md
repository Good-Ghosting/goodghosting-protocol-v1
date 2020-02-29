# Viral Save Gamex

Earn more interest by inviting friends

# Internals

[Based on Drizzle box](https://www.trufflesuite.com/boxes/drizzle).

# Usage

## Starting the game as a player

User needs to do the following to start the game

* Have 9.90 DAI balance in their wallet

* Have referring player address

* `approve()` the `ViralBank` contract for `DAI` token transfers

* Do a transaction to `startGame()`

## Playing the game

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

