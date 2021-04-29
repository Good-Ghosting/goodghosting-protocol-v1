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

# Smart Contract Overview
Note: this is outdated. There have been a number of improvements. For instance, users are able to join from segment 0 and we use the 'The Graph' to query the game data.
![high level diagram](https://github.com/Good-Ghosting/goodghosting-smart-contracts/blob/master/smart_contract_overview_11-07-20.png?raw=true)

## Example view of the UI


# Development

## Development Recommendations

- Try to use well-known patterns and best practices when possible. They help us to decrease the likelihood of introducing vulnerabilities in the code.
- Try to use declarative names for functions and variables. They increase code readability and maintainability
- Try to keep test coverage as close as possible to 100%. It helps to make sure the contract does what is supposed to do, according to project specs.
- Try not to only think about how to make the code work so it meets the project specifications. But, also think about how to break it, how to try to use "out-of-scope" scenarios to exploit the contract's functionality (think as the bad guy). Examples: invalid inputs, calls to functions out of sequence (when they were supposed to follow a specific sequence of calls defined by the state machine), external contract interactions, etc.
- Try to use security tools (i.e., Slither, MythX, etc.) as part of the development process to help to identify well-known / documented issues. Security should be part of the development routine, and not something to be postponed prior to deploying the contract(s) on mainnet. Exploits, bugs and unknown vulnerable scenarios may happen, but we should make our best effort to have in place a development process that considers security on a daily-basis and fully embracing it while developing.

## Setup

Install Truffle.
```bash
npm install -g truffle
```

Install Ganache for having a local dev Ethereum network.
```bash
npm install -g ganache ganache-cli
```

Create a local `.env` file by copying the sample `.env.sample` file available in the root folder (`cp .env.sample .env`). After your `.env` file is created, edit it with appropriate values for the variables.


## Common Development Commands

Compile contracts
```bash
truffle compile
```

Start dev env in one terminal
```bash
truffle develop
```


## Maintaining Packages Updated

To check for new packages, install [npm-check-updates](https://www.npmjs.com/package/npm-check-updates): `npm install -g npm-check-updates`.

To check for updates for `ncu`
To check and update `package.json` file, run `ncu -u`. Once completed, make sure to run `npm install` to update all the packages.


# Tests

## Unit Tests

**Requirement:** The tests use the file `deploy.config.js` as input to the contract migration. Make sure it is configured.

For the current contract version we have whitelisted players with help of merkel root verification on-chain, so the joinGame method takes in player index and merkel proofs hence check the instructions [here](https://github.com/Good-Ghosting/goodghosting-smart-contracts/blob/master/test/GoodGhosting.test.js#L8) before the next step.

To run the unit tests use either
`truffle test -m "clutchaptain shoe salt awake harvest setup primary inmate ugly among become"`
or
`npm run test`

To run test coverage: `npm run coverage` or `truffle run coverage`


## Test with Mainnet fork
To run the integrated test scenarios forking from Mainnet:

- Configure `DAI_ACCOUNT_HOLDER_FORKED_NETWORK` in your `.env` file with an externally owned account (not smart contract) that holds enough DAI and ADAI balance on the forked network, `0x4a75f0ae51a5d616ada4db52be140d89302aaf78` account holds both assets so this can be used. To find another one, go to the DAI Token explorer (https://ethplorer.io/ or https://etherscan.io/) and get one of the top holders

- On a terminal window, execute `ganache-cli` forking from mainnet. For details, check this [article](https://ethereumdev.io/testing-your-smart-contract-with-existing-protocols-ganache-fork/). Make sure to pass the address defined in the `.env` file in the `--unlock` parameter. The full command should look something like this:

  `ganache-cli -f https://cloudflare-eth.com/  -m "clutchaptain shoe salt awake harvest setup primary inmate ugly among become" -i 999 --unlock {DAI_ACCOUNT_HOLDER_FORKED_NETWORK}`


- On another terminal window (from the root of the project directory), run `truffle test --network local-mainnet-fork` or `npm run test:fork:mainnet`

## Primary Contracts Overview
* **[GoodGhosting](https://github.com/Good-Ghosting/goodghosting-smart-contracts/blob/master/contracts/GoodGhosting.sol)** is the game contract where whitelisted players cam join the game, make regular deposits and win, the external pool used for generating interest here is [Aave](https://aave.com/).

* **[GoodGhostingWhitelisted](https://github.com/Good-Ghosting/goodghosting-smart-contracts/blob/master/contracts/GoodGhostingWhitelisted.sol)** is basically extended by the GoodGhosting and contains all the merkel proof verifying logic, so whenever any player joins the game they are verified based on proof and merkel root inside this contract.

* **[GoodGhosting_Polygon](https://github.com/Good-Ghosting/goodghosting-smart-contracts/blob/master/contracts/GoodGhosting_Polygon.sol)** is just an extension of the GoodGhosting contract compatible with [Polygon](https://polygon.technology/) to generate extra yield from the ongoing [Aave-Polygon Liquidity mining](https://cryptobriefing.com/polygon-launches-40m-liquidity-mining-program-with-aave/) this contract, when the game ends claims $MATIC rewards, to generate extra yield for the winners.

## Big Numbers
* We use `BN.js` for handling Big Numbers
* Both DAI and aDAI work similarly with `toWei`, i.e. 10**18


# Security Tools
There's a few automated security tools that could be integrated with the development process. Currently, we use [Slither](https://github.com/crytic/slither) to help identify well-known issues via static analysis. Other tools may be added in the near future as part of the continuous improvement process.

## Slither
Make sure you install Slither by following the instructions available on [Slither's](https://github.com/crytic/slither) github page. Note: it requires Python, so you may need to install it before you're able to use Slither.

Slither can be executed with the following command:

```bash
slither contracts/GoodGhosting.sol --filter-paths "openzeppelin|aave"
```
This commands executes Slither and analyses the file `contracts/GoodGhosting.sol`, ignoring dependency contracts related to "openzeppelin" and "aave".

**Note:** You may get an error from Slither mentioning an imported file wasn't found. Example:
```bash
Error: Source "@openzeppelin/contracts/access/Ownable.sol" not found: File not found.
 --> contracts/GoodGhosting.sol:5:1:
  |
5 | import "@openzeppelin/contracts/access/Ownable.sol";
```

This happens because Slither can't resolve the `import` in the contract to the `node_modules` folder.
Using the results from the example above, the `import` command `import "@openzeppelin/contracts/access/Ownable.sol";` should be replaced by `import "node_modules/@openzeppelin/contracts/access/Ownable.sol";`. **PLEASE DO NOT COMMIT THIS CHANGE**. It is only applicable when running Slither.


# Deploying contracts to Ethereum Networks
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
- Deploy to polygon (PRODUCTION): `npm run deploy:polygon`

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

## Merkel Root Generation
For deploying current version of the game contracts a merkel root is required, introduced for the purpose of whitelisting users.

Clone this [repository](https://github.com/Good-Ghosting/Whitelisting)

Install Dependencies: `yarn install`

Edit this [file](https://github.com/Good-Ghosting/Whitelisting/blob/master/scripts/example.json) with the addresses you want to whitelist keeping the JSON format same.

Run: `yarn generate-merkle-root:example`

You should see like this

`{"merkleRoot":"0x40867aa687de5ac616962b562ed033e36f9002c696ae408b9144e9f425ab166e","claims":{"0x49456a22bbED4Ae63d2Ec45085c139E6E1879A17":{"index":0,"exists":true,"proof":["0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"]},"0x4e7F88e38A05fFed54E0bE6d614C48138cE605Cf":{"index":1,"exists":true,"proof":["0x6ecff5307e97b4034a59a6888301eaf1e5fdcc399163a89f6e886d1ed4a6614f"]}}}`

Replace the merkel root parameter in the [deploy.config.js][./deploy.config.js] file.


## Addresses

DAI and aDAI addresses are configured in the [deploy.config.js][./deploy.config.js] file for the supported network.
