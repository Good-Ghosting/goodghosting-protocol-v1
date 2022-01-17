/* global */
const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("MockERC20Mintable");
const GoodGhostingPolygonWhitelisted = artifacts.require("GoodGhostingPolygonWhitelisted");
const IncentiveControllerMock = artifacts.require("IncentiveControllerMock");

const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const coveragePlayerConfig = [
    { "0x49456a22bbED4Ae63d2Ec45085c139E6E1879A17": { index: 0, proof: ["0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"] } },
    { "0x4e7F88e38A05fFed54E0bE6d614C48138cE605Cf": { index: 1, proof: ["0x6ecff5307e97b4034a59a6888301eaf1e5fdcc399163a89f6e886d1ed4a6614f"] } },
    // invalid user
    { "0x78863CB2db754Fc45030c4c25faAf757188A0784": { index: 3, proof: ["0x45533c7da4a9f550fb2a9e5efe3b6db62261670807ed02ce75cb871415d708cc", "0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef", "0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"] } }
];
const testPlayerConfig = [
    { "0xf17f52151EbEF6C7334FAD080c5704D77216b732": { index: 1, proof: ["0x2882c9f01add5f1c877ca051d110e9e58fbedc3164a1ae605f2fb231e9d9fb70"] } },
    { "0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef": { index: 0, proof: ["0x93e8909af44acf5e2128ec9b84e3ba358ce1de36b5c9d6f9c61e14bb89a1d5f2"] } },
    // invalid user
    { "0x821aEa9a577a9b44299B9c15c88cf3087F3b5544": { index: 3, proof: ["0x45533c7da4a9f550fb2a9e5efe3b6db62261670807ed02ce75cb871415d708cc", "0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef", "0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"] } }
];

contract("GoodGhostingPolygonWhitelisted", (accounts) => {
    let merkleRoot;
    let whitelistedPlayerConfig;

    // Only executes this test file IF NOT a local network fork
    if (["local-mainnet-fork", "local-celo-fork", "local-polygon-vigil-fork", "local-polygon-whitelisted-vigil-fork"].includes(process.env.NETWORK)) return;

    if (process.env.NETWORK.toLowerCase().includes("coverage")) {
        whitelistedPlayerConfig = coveragePlayerConfig;
        merkleRoot = "0x40867aa687de5ac616962b562ed033e36f9002c696ae408b9144e9f425ab166e";
    } else {
        whitelistedPlayerConfig = testPlayerConfig;
        merkleRoot = "0xd53ed7372825e2b21778b03e7f08246a9e358bf89416c856ebb4f196fca5e662";
    }

    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let aToken;
    let goodGhosting;
    let pap;
    let incentiveController;
    let player1 = accounts[1];
    let player2 = accounts[2];
    let nonPlayer = accounts[3];

    const weekInSecs = 180;
    const fee = 10; // represents 10%
    const adminFee = 5; // represents 5%
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(10)); // equivalent to 10 DAI
    const segmentCount = 6;
    const segmentLength = 180;
    const maxPlayersCount = new BN(100);
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    beforeEach(async () => {
        global.web3 = web3;
        token = await ERC20Mintable.new("MINT", "MINT", { from: admin });
        // creates dai for player1 to hold.
        // Note DAI contract returns value to 18 Decimals
        // so token.balanceOf(address) should be converted with BN
        // and then divided by 10 ** 18
        await mintTokensFor(player1);
        await mintTokensFor(player2);
        pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
        aToken = await IERC20.at(await pap.getLendingPool.call());
        await pap.setUnderlyingAssetAddress(token.address);
        incentiveController = await IncentiveControllerMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });

        goodGhosting = await GoodGhostingPolygonWhitelisted.new(
            token.address,
            pap.address,
            segmentCount,
            segmentLength,
            segmentPayment,
            fee,
            adminFee,
            pap.address,
            maxPlayersCount,
            ZERO_ADDRESS,
            incentiveController.address,
            incentiveController.address,
            merkleRoot,
            { from: admin },
        );
    });

    async function mintTokensFor(player) {
        await token.mint(player, toWad(1000), { from: admin });
    }

    async function approveDaiToContract(fromAddr) {
        await token.approve(goodGhosting.address, segmentPayment, { from: fromAddr });
    }

    describe("pre-flight checks", async () => {
        it("checks if DAI and aDAI contracts have distinct addresses", async () => {
            const daiAdd = token.address;
            const aDaiAdd = pap.address;
            assert(daiAdd !== aDaiAdd, `DAI ${daiAdd} and ADAI ${aDaiAdd} shouldn't be the same address`);
        });

        it("checks that contract starts holding 0 Dai and 0 aDai", async () => {
            const daiBalance = await token.balanceOf(goodGhosting.address);
            const aDaiBalance = await pap.balanceOf(goodGhosting.address);
            assert(
                daiBalance.toNumber() === 0,
                `On start, smart contract's DAI balance should be 0 DAI - got ${daiBalance.toNumber()} DAI`,
            );
            assert(
                aDaiBalance.toNumber() === 0,
                `on start, smart contract's aDAI balance should be 0 aDAI - got ${aDaiBalance.toNumber()} aDAI`,
            );
        });

        it("checks if player1 received minted DAI tokens", async () => {
            const usersDaiBalance = await token.balanceOf(player1);
            // BN.gte => greater than or equals (see https://github.com/indutny/bn.js/)
            assert(usersDaiBalance.div(daiDecimals).gte(new BN(1000)), `Player1 balance should be greater than or equal to 100 DAI at start - current balance: ${usersDaiBalance}`);
        });

        it("reverts if the contract is deployed with 0% early withdraw fee", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                0,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "_earlyWithdrawalFee must be greater than zero");
        });

        it("reverts if the contract is deployed with early withdraw fee more than 10%", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                15,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "_earlyWithdrawalFee must be less than or equal to 10%");
        });

        it("reverts if the contract is deployed with admin fee more than 20%", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                30,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "_customFee must be less than or equal to 20%");
        });

        it("reverts if the contract is deployed with max player count equal to zero", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(
                GoodGhostingPolygonWhitelisted.new(
                    token.address,
                    pap.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    0,
                    pap.address,
                    new BN(0), // set to 0 to force revert
                    ZERO_ADDRESS,
                    incentiveController.address,
                    incentiveController.address,
                    merkleRoot,
                    { from: admin },
                ),
                "_maxPlayersCount must be greater than zero"
            );
        });

        it("accepts setting type(uint256).max as the max number of players", async () => {
            const expectedValue = new BN(2).pow(new BN(256)).sub(new BN(1));
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            const contract = await GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                0,
                pap.address,
                "115792089237316195423570985008687907853269984665640564039457584007913129639935", // equals to 2**256-1
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            );
            const result = new BN(await contract.maxPlayersCount.call());
            assert(expectedValue.eq(result), "expected max number of players to equal type(uint256).max");
        });

        it("reverts if the contract is deployed with invalid inbound token address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                ZERO_ADDRESS,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                3,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "invalid _inboundCurrency address");
        });

        it("reverts if the contract is deployed with invalid lending pool address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                ZERO_ADDRESS,
                segmentCount,
                segmentLength,
                segmentPayment,
                3,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "invalid _lendingPoolAddressProvider address");
        });

        it("reverts if the contract is deployed with segment count as 0", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                new BN(0),
                segmentLength,
                segmentPayment,
                3,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "_segmentCount must be greater than zero");
        });

        it("reverts if the contract is deployed with segment length as 0", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                new BN(0),
                segmentPayment,
                3,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "_segmentLength must be greater than zero");
        });

        it("reverts if the contract is deployed with segment payment as 0", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                new BN(0),
                1,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "_segmentPayment must be greater than zero");
        });

        it("reverts if the contract is deployed with invalid data provider address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                1,
                adminFee,
                ZERO_ADDRESS,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "invalid _dataProvider address");
        });

        it("reverts if the contract is deployed with invalid incentive controller address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                3,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                ZERO_ADDRESS,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            ),
            "invalid _incentiveController address");
        });

        it("reverts if the contract is deployed with invalid matic token address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                3,
                adminFee,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                ZERO_ADDRESS,
                merkleRoot,
                { from: admin },
            ),
            "invalid _matic address");
        });
    });

    describe("when the contract is deployed", async () => {
        it("checks if the contract's variables were properly initialized", async () => {
            const inboundCurrencyResult = await goodGhosting.daiToken.call();
            const interestCurrencyResult = await goodGhosting.adaiToken.call();
            const lendingPoolAddressProviderResult = await goodGhosting.lendingPoolAddressProvider.call();
            const incentiveControllerResult = await goodGhosting.incentiveController.call();
            const lastSegmentResult = await goodGhosting.lastSegment.call();
            const segmentLengthResult = await goodGhosting.segmentLength.call();
            const segmentPaymentResult = await goodGhosting.segmentPayment.call();
            const merkleRootResult = await goodGhosting.merkleRoot.call();
            const maxPlayersCountResult = await goodGhosting.maxPlayersCount.call();
            const incentiveToken = await goodGhosting.incentiveToken.call();

            assert(incentiveControllerResult === incentiveController.address, `Incentive Controller address doesn't match. expected ${incentiveController.address}; got ${incentiveControllerResult}`);
            assert(inboundCurrencyResult === token.address, `Inbound currency doesn't match. expected ${token.address}; got ${inboundCurrencyResult}`);
            assert(interestCurrencyResult === aToken.address, `Interest currency doesn't match. expected ${aToken.address}; got ${interestCurrencyResult}`);
            assert(lendingPoolAddressProviderResult === pap.address, `LendingPoolAddressesProvider doesn't match. expected ${pap.address}; got ${lendingPoolAddressProviderResult}`);
            assert(new BN(lastSegmentResult).eq(new BN(segmentCount)), `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`);
            assert(new BN(segmentLengthResult).eq(new BN(segmentLength)), `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`);
            assert(new BN(segmentPaymentResult).eq(new BN(segmentPayment)), `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`);
            assert(merkleRootResult === merkleRoot, `MerkleRoot doesn't match. expected ${merkleRoot}; got ${merkleRootResult}`);
            assert(new BN(maxPlayersCountResult).eq(maxPlayersCount), `MaxPlayersCount doesn't match. expected ${maxPlayersCount.toString()}; got ${maxPlayersCountResult}`);
            assert(incentiveToken === ZERO_ADDRESS);
        });

        it("checks if game starts at segment zero", async () => {
            const expectedSegment = new BN(0);
            const result = await goodGhosting.getCurrentSegment.call({ from: admin });
            assert(
                result.eq(new BN(0)),
                `should start at segment ${expectedSegment} but started at ${result.toNumber()} instead.`,
            );
        });
    });

    describe("when an user tries to join a game", async () => {
        it("reverts if the contract is paused", async () => {
            await goodGhosting.pause({ from: admin });
            await truffleAssert.reverts(goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "Pausable: paused");
        });

        it("reverts if user does not approve the contract to spend dai", async () => {
            await truffleAssert.reverts(goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "You need to have allowance to do transfer DAI on the smart contract");
        });

        it("reverts if the user tries to join after the first segment", async () => {
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "Game has already started");
        });

        it("reverts when a non-whitelisted player tries to join the game", async () => {
            await truffleAssert.reverts(goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[2][nonPlayer].index, whitelistedPlayerConfig[2][nonPlayer].proof, { from: nonPlayer }), "MerkleDistributor: Invalid proof.");
        });

        it("reverts when whitelisted user tries to join using joinGame() instead of joinWhitelistedGame(...)", async () => {
            await truffleAssert.reverts(goodGhosting.joinGame( { from: player1 }), "Whitelisting enabled - use joinWhitelistedGame(uint256, bytes32[]) instead");
        });

        it("reverts when non-whitelisted user tries to join using joinGame() joinWhitelistedGame(...)", async () => {
            await truffleAssert.reverts(goodGhosting.joinGame( { from: nonPlayer }), "Whitelisting enabled - use joinWhitelistedGame(uint256, bytes32[]) instead");
        });

        it("reverts if the user tries to join the game twice", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "Cannot join the game more than once");
        });

        it("reverts if more players than maxPlayersCount try to join", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            const contract = await GoodGhostingPolygonWhitelisted.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                0,
                pap.address,
                1, // max of 1 player
                ZERO_ADDRESS,
                incentiveController.address,
                incentiveController.address,
                merkleRoot,
                { from: admin },
            );
            await token.approve(contract.address, segmentPayment, { from: player1 });
            await contract.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await token.approve(contract.address, segmentPayment, { from: player2 });
            await truffleAssert.reverts(
                contract.joinWhitelistedGame(whitelistedPlayerConfig[1][player2].index, whitelistedPlayerConfig[1][player2].proof, { from: player2 }),
                "Reached max quantity of players allowed",
            );
        });

        it("stores the player(s) who joined the game", async () => {
            // Player1 joins the game
            await approveDaiToContract(player1);
            await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });

            await approveDaiToContract(player2);
            await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[1][player2].index, whitelistedPlayerConfig[1][player2].proof, { from: player2 });

            // Reads stored players and compares against player1 and player2
            // Remember: "iterablePlayers" is an array, so we need to pass the index we want to retrieve.
            const storedPlayer1 = await goodGhosting.iterablePlayers.call(0);
            const storedPlayer2 = await goodGhosting.iterablePlayers.call(1);
            assert(storedPlayer1 === player1);
            assert(storedPlayer2 === player2);

            // Checks player's info stored in the struct.
            const playerInfo1 = await goodGhosting.players(player1);
            assert(playerInfo1.mostRecentSegmentPaid.eq(new BN(0)));
            assert(playerInfo1.amountPaid.eq(segmentPayment));
            assert(playerInfo1.canRejoin ===  false);
            assert(playerInfo1.withdrawn ===  false);

            const playerInfo2 = await goodGhosting.players(player1);
            assert(playerInfo2.mostRecentSegmentPaid.eq(new BN(0)));
            assert(playerInfo2.amountPaid.eq(segmentPayment));
            assert(playerInfo2.canRejoin ===  false);
            assert(playerInfo2.withdrawn ===  false);
        });

        it("emits the event JoinedGame", async () => {
            await approveDaiToContract(player1);
            const result = await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            let playerEvent = "";
            let paymentEvent = 0;
            truffleAssert.eventEmitted(
                result,
                "JoinedGame",
                (ev) => {
                    playerEvent = ev.player;
                    paymentEvent = ev.amount;
                    return playerEvent === player1 && new BN(paymentEvent).eq(new BN(segmentPayment));
                },
                `JoinedGame event should be emitted when an user joins the game with params\n
                player: expected ${player1}; got ${playerEvent}\n
                paymentAmount: expected ${segmentPayment}; got ${paymentEvent}`,
            );
        });
    });
});
