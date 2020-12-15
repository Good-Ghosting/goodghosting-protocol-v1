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
- Users can withdraw their principal at any time, if they wish to do so (`earlyWithdraw`)

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
The project uses [Infura](https://infura.io/) to deploy smart contracts to Ethereum networks (testnets and mainnet). What you'll need:
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

If the deployment is successful, you should see a deployment log in the terminal window similar to this:

```
Starting migrations...
======================
> Network name:    'kovan'
> Network id:      42
> Block gas limit: 12500000 (0xbebc20)


2_deploy_contracts.js
=====================

   Replacing 'SafeMath'
   --------------------
   > transaction hash:    0x0f400b0dc0fcd29c943271f2823d3922db14aa3a7baa8e17295d15b6c1d442b6
   > Blocks: 0            Seconds: 0
   > contract address:    0x66FF9E7d6Dca966eB6798079Fec3D482179cdDC8
   > block number:        22436472
   > block timestamp:     1607159132
   > account:             0x826a471055333505E596F424348983aF0Aa8411B
   > balance:             192.247194179
   > gas used:            71933 (0x118fd)
   > gas price:           20 gwei
   > value sent:          0 ETH
   > total cost:          0.00143866 ETH

   Pausing for 2 confirmations...
   ------------------------------
   > confirmation number: 1 (block: 22436473)
   > confirmation number: 2 (block: 22436474)

   Replacing 'GoodGhosting'
   ------------------------
   > transaction hash:    0xaded2b2130afff3c62ec96dc67e7fc63dbf830edc4c551746c72566c8f6e15ce
   > Blocks: 0            Seconds: 0
   > contract address:    0x1180d93c188874F1BE03702c259fb53a88605EC7
   > block number:        22436475
   > block timestamp:     1607159152
   > account:             0x826a471055333505E596F424348983aF0Aa8411B
   > balance:             192.192982659
   > gas used:            2710576 (0x295c30)
   > gas price:           20 gwei
   > value sent:          0 ETH
   > total cost:          0.05421152 ETH

   Pausing for 2 confirmations...
   ------------------------------
   > confirmation number: 1 (block: 22436476)
   > confirmation number: 2 (block: 22436477)



----------------------------------------------------
GoogGhosting deployed with the following parameters:
----------------------------------------------------

Network Name: kovan
Lending Pool: aave
Lending Pool Address Provider: 0x506B0B2CF20FAA8f38a4E2B524EE43e1f4458Cc5
Inbound Currency: dai at 0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD
Segment Count: 6
Segment Length: 180 seconds
Segment Payment: 10 dai (10000000000000000000 wei)
Early Withdrawal Fee: 10%


ABI-Enconded Constructor Parameters:
000000000000000000000000ff795577d9ac8bd7d90ee22b6c1703490b6512fd000000000000000000000000506b0b2cf20faa8f38a4e2b524ee43e1f4458cc5000000000000000000000000000000000000000000000000000000000000000600000000000000000000000000000000000000000000000000000000000000b40000000000000000000000000000000000000000000000008ac7230489e80000000000000000000000000000000000000000000000000000000000000000000a





   > Saving artifacts
   -------------------------------------
   > Total cost:          0.05565018 ETH


Summary
=======
> Total deployments:   2
> Final cost:          0.05565018 ETH
```

## Verifying contracts on Etherscan
Use the following steps to verify the contract on Etherscan:

1. Flatten the GoogGhosting contract. If using VSCode, you can use the extension (Solidity Contract Flattener)[https://marketplace.visualstudio.com/items?itemName=tintinweb.vscode-solidity-flattener]
2. In the new flattened file, delete all references to "// SPDX-License-Identifier: MIT". Tip: Use the "find and replace" option on your code editor, by finding by the value "// SPDX-License-Identifier: MIT" and replacing by an empty string (empty value in the "replace" field)
3. Access the deployed contract address on Etherscan. Make sure to use the appropriate Etherscan version that matches the network where the contract is deployed to
    1. The address of the deployed contract is available in the deployment log, displayed in the terminal window
4. Access the option to "Verify and Publish" the contract on Etherscan and enter the required parameters as below:
    1. *Contract Address*: get the address of the deployed contract from the deployment log, displayed in the terminal window
    2. *Compiler Type*: Select the option "Solidity (Single File)"
    3. *Compiler Version*: Check the version used by the repo on (truffle-config file)[./truffle-config.js]. Select the same config
    4. *Open Source License*: Choose the license. You can use "No licence (None)" if not sure about which one to use
    5. *Optimization*: Check is optimization is used by the repo on (truffle-config file)[./truffle-config.js]. Select the same config
    6. *Solidity Contract Code*: Copy/Paste the code from the flattened file (after executing steps 1 and 2 above).
    7. *Constructor Arguments ABI-Enconded*: Copy/Paste the Constructor Arguments ABI-Enconded available in the deployment log, displayed in the terminal window


## Maintaining Packages Updated

To check for new packages, install [npm-check-updates](https://www.npmjs.com/package/npm-check-updates): `npm install -g npm-check-updates`.

To check for updates for `ncu`
To check and update `package.json` file, run `ncu -u`. Once completed, make sure to run `npm install` to update all the packages.


## Addresses

**Kovan**

* DAI: https://kovan.etherscan.io/address/0xFf795577d9AC8bD7D90Ee22b6C1703490b6512FD
* aDAI: https://kovan.etherscan.io/address/0x58AD4cB396411B691A9AAb6F74545b2C5217FE6a
* GoodGhosting.sol: https://kovan.etherscan.io/address/0x16D1feaC977dFb79a879BD5e5B7Ed37E81C3D660#code


## Using
* BN.js for handling Bignumbers
* Both DAI and aDAI work similarily to Wei. ie 10**18 
