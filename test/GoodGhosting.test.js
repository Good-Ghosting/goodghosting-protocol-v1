/* global context */
const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("MockERC20Mintable");
const GoodGhosting = artifacts.require("GoodGhosting");
const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

contract("GoodGhosting", (accounts) => {
    // Only executes this test file IF NOT a local network fork
    if (["local-mainnet-fork", "local-polygon-vigil-fork", "local-polygon-whitelisted-vigil-fork"].includes(process.env.NETWORK)) return;

    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let aToken;
    let goodGhosting;
    let pap;
    let player1 = accounts[1];
    let player2 = accounts[2];
    const nonPlayer = accounts[9];

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
        goodGhosting = await GoodGhosting.new(
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
            { from: admin },
        );
    });

    async function mintTokensFor(player) {
        await token.mint(player, toWad(1000), { from: admin });
    }

    async function approveDaiToContract(fromAddr) {
        await token.approve(goodGhosting.address, segmentPayment, { from: fromAddr });
    }

    async function advanceToEndOfGame() {
        // We need to to account for the first deposit window.
        // i.e., if game has 5 segments, we need to add + 1, because while current segment was 0,
        // it was just the first deposit window (a.k.a., joining period).
        await timeMachine.advanceTime(weekInSecs * (segmentCount + 1));
    }

    async function joinGamePaySegmentsAndComplete(player, contractInstance) {
        let contract = contractInstance;
        if (!contract) {
            contract = goodGhosting;
        }
        await approveDaiToContract(player);
        await contract.joinGame({ from: player });
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player);
            await contract.makeDeposit({ from: player });
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs * 2);
    }

    async function joinGameMissLastPaymentAndComplete(player) {
        await approveDaiToContract(player);
        await goodGhosting.joinGame({ from: player });
        // pay all remaining segments except last one
        for (let index = 1; index < segmentCount - 1; index++) {
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player);
            await goodGhosting.makeDeposit({ from: player });
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 2.
        // now, we move 3 more segments (segmentCount-2, segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs * 3);
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
            assert(usersDaiBalance.div(daiDecimals).gte(new BN(1000)), `Player1 balance should be greater than or equal to 100 DAI at start - current balance: ${usersDaiBalance}`);
        });

        it("reverts if the contract is deployed with 0% early withdraw fee", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhosting.new(
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
                { from: admin },
            ));
        });

        it("reverts if the contract is deployed with early withdraw fee more than 10%", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhosting.new(
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
                { from: admin },
            ));
        });

        it("reverts if the contract is deployed with admin fee more than 20%", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhosting.new(
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
                { from: admin },
            ));
        });

        it("reverts if the contract is deployed with max player count equal to zero", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(
                GoodGhosting.new(
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
            const contract = await GoodGhosting.new(
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
                { from: admin },
            );
            const result = new BN(await contract.maxPlayersCount.call());
            assert(expectedValue.eq(result), "expected max number of players to equal type(uint256).max");
        });
    });

    describe("when the contract is deployed", async () => {
        it("checks if the contract's variables were properly initialized", async () => {
            const inboundCurrencyResult = await goodGhosting.daiToken.call();
            const interestCurrencyResult = await goodGhosting.adaiToken.call();
            const lendingPoolAddressProviderResult = await goodGhosting.lendingPoolAddressProvider.call();
            const lastSegmentResult = await goodGhosting.lastSegment.call();
            const segmentLengthResult = await goodGhosting.segmentLength.call();
            const segmentPaymentResult = await goodGhosting.segmentPayment.call();
            const earlyWithdrawFee = await goodGhosting.earlyWithdrawalFee.call();
            const adminFee = await goodGhosting.customFee.call();
            const maxPlayersCountResult = await goodGhosting.maxPlayersCount.call();
            const incentiveToken = await goodGhosting.incentiveToken.call();
            assert(new BN(earlyWithdrawFee).eq(new BN(10)), `Early Withdraw Fee doesn't match, expected 10 got ${earlyWithdrawFee}`);
            assert(new BN(adminFee).eq(new BN(5)), `Admin Fee doesn't match, expected 5 got ${adminFee}`);
            assert(inboundCurrencyResult === token.address, `Inbound currency doesn't match. expected ${token.address}; got ${inboundCurrencyResult}`);
            assert(interestCurrencyResult === aToken.address, `Interest currency doesn't match. expected ${aToken.address}; got ${interestCurrencyResult}`);
            assert(lendingPoolAddressProviderResult === pap.address, `LendingPoolAddressesProvider doesn't match. expected ${pap.address}; got ${lendingPoolAddressProviderResult}`);
            assert(new BN(lastSegmentResult).eq(new BN(segmentCount)), `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`);
            assert(new BN(segmentLengthResult).eq(new BN(segmentLength)), `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`);
            assert(new BN(segmentPaymentResult).eq(new BN(segmentPayment)), `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`);
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

        it("checks incentive token address is set", async () => {
            const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            const contract = await GoodGhosting.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                0,
                pap.address,
                "115792089237316195423570985008687907853269984665640564039457584007913129639935", // equals to 2**256-1
                incentiveToken.address,
                { from: admin },
            );
            const result = await contract.incentiveToken.call();
            assert(incentiveToken.address === result, "expected incentive token address to be set");
        });
    });

    describe("when the time passes for a game", async () => {
        it("checks if the game segments increase", async () => {
            let result = -1;
            for (let expectedSegment = 0; expectedSegment <= segmentCount; expectedSegment++) {
                result = await goodGhosting.getCurrentSegment.call({ from: admin });
                assert(
                    result.eq(new BN(expectedSegment)),
                    `expected segment ${expectedSegment} actual ${result.toNumber()}`,
                );
                await timeMachine.advanceTimeAndBlock(weekInSecs);
            }
        });

        it("checks if the game completes when last segment completes", async () => {
            let result = -1;
            let currentSegment = -1;

            async function checksCompletion(expected, errorMsg) {
                currentSegment = await goodGhosting.getCurrentSegment.call({ from: admin });
                result = await goodGhosting.isGameCompleted.call({ from: admin });
                assert(result === expected, errorMsg);
            }

            for (let i = 0; i <= segmentCount; i++) {
                await checksCompletion(false, `game completed prior than expected; current segment: ${currentSegment}`);
                await timeMachine.advanceTimeAndBlock(weekInSecs);
            }

            await checksCompletion(true, `game did not completed after last segment: ${currentSegment}`);
        });
    });

    describe("when an user tries to join a game", async () => {
        it("reverts if the contract is paused", async () => {
            await goodGhosting.pause({ from: admin });
            await truffleAssert.reverts(goodGhosting.joinGame({ from: player1 }), "Pausable: paused");
        });

        it("reverts if user does not approve the contract to spend dai", async () => {
            await truffleAssert.reverts(goodGhosting.joinGame({ from: player1 }), "You need to have allowance to do transfer DAI on the smart contract");
        });

        it("reverts if the user tries to join after the first segment", async () => {
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinGame( { from: player1 }), "Game has already started");
        });

        it("reverts if the user tries to join the game twice", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinGame( { from: player1 }), "Cannot join the game more than once");
        });

        it("reverts if more players than maxPlayersCount try to join", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            const contract = await GoodGhosting.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                0,
                pap.address,
                2, // max of 2 players
                ZERO_ADDRESS,
                { from: admin },
            );
            await token.approve(contract.address, segmentPayment, { from: player1 });
            await contract.joinGame( { from: player1 });
            await token.approve(contract.address, segmentPayment, { from: player2 });
            await contract.joinGame( { from: player2 });
            await token.approve(contract.address, segmentPayment, { from: nonPlayer });
            await truffleAssert.reverts(contract.joinGame( { from: nonPlayer }), "Reached max quantity of players allowed");
        });

        it("stores the player(s) who joined the game", async () => {
            // Player1 joins the game
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });

            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player2 });

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

        it("transfers the first payment to the contract", async () => {
            // Player1 joins the game
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            const contractsDaiBalance = await pap.balanceOf(goodGhosting.address);
            assert(contractsDaiBalance.eq(segmentPayment), "Contract balance should increase when user joins the game");
        });

        it("emits the event JoinedGame", async () => {
            await approveDaiToContract(player1);
            const result = await goodGhosting.joinGame( { from: player1 });
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

    describe("when a player tries to rejoin", async () => {
        it("reverts if user tries to rejoin the game after segment 0", async() => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTime(weekInSecs);
            await goodGhosting.earlyWithdraw({ from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinGame( { from: player1 }), "Game has already started");
        });

        it("reverts if a user tries to rejoin the game in segment 0 without doing an early withdraw", async() => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinGame( { from: player1 }), "Cannot join the game more than once");
        });

        it("user can rejoin the game on segment 0 after an early withdrawal", async() => {
            await approveDaiToContract(player1);
            const playerAllowance = await token.allowance(player1, goodGhosting.address);
            assert(playerAllowance.gte(segmentPayment));
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.earlyWithdraw({ from: player1 });
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
        });

        it("verifies the player info stored in the contract after user rejoins after an early withdraw", async() => {
            await approveDaiToContract(player1);
            const playerAllowance = await token.allowance(player1, goodGhosting.address);
            assert(playerAllowance.gte(segmentPayment));
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.earlyWithdraw({ from: player1 });
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            const playerInfo = await goodGhosting.players(player1);
            assert(playerInfo.mostRecentSegmentPaid.eq(new BN(0)));
            assert(playerInfo.amountPaid.eq(segmentPayment));
            assert(playerInfo.canRejoin ===  false);
            assert(playerInfo.withdrawn ===  false);
        });

        it("does not increase the number of players when a user rejoins the game on segment 0 after an early withdrawal", async() => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.joinGame( { from: player2 });
            await goodGhosting.earlyWithdraw({ from: player1 });
            await approveDaiToContract(player1);
            const userDaiBalance = await token.balanceOf(player1);
            assert(userDaiBalance.gte(segmentPayment));
            await goodGhosting.joinGame( { from: player1 });
            const numPlayers = await goodGhosting.getNumberOfPlayers();
            assert(numPlayers.eq(new BN(2)));
        });
    });

    describe("when an user tries to make a deposit", async () => {
        it("reverts if the contract is paused", async () => {
            await goodGhosting.pause({ from: admin });
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Pausable: paused");
        });

        it("reverts if user didn't join the game", async () => {
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Sender is not a player");
        });

        it("reverts if user tries to deposit during segment 0", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Deposit available only between segment 1 and segment n-1 (penultimate)");
        });

        it("reverts if user is making a deposit during segment n (last segment)", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            // Advances to last segment
            await timeMachine.advanceTime(weekInSecs * segmentCount);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Deposit available only between segment 1 and segment n-1 (penultimate)");
        });

        it("reverts if user tries to deposit after the game ends", async() => {
            await joinGamePaySegmentsAndComplete(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), " Deposit available only between segment 1 and segment n-1 (penultimate)");
        });

        it("reverts if user is making a duplicated deposit for the same segment", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            // Moves to the next segment
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player1);
            await goodGhosting.makeDeposit({ from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Player already paid current segment");
        });

        it("reverts if user forgot to deposit for previous segment", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTime(weekInSecs * 2);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Player didn't pay the previous segment - game over!");
        });

        it("user can deposit successfully if all requirements are met", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            const result = await goodGhosting.makeDeposit({ from: player1 });
            truffleAssert.eventEmitted(
                result,
                "Deposit",
                (ev) => ev.player === player1,
                "player unable to deposit for segment 2 when all requirements were met",
            );
        });

        it("transfers the payment to the contract", async () => {
            const expectedBalance = web3.utils.toBN(segmentPayment * 2);
            await approveDaiToContract(player1);
            const playerAllowance = await token.allowance(player1, goodGhosting.address);
            assert(playerAllowance.gte(segmentPayment));
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            await goodGhosting.makeDeposit({ from: player1 });
            const contractsDaiBalance = await pap.balanceOf(goodGhosting.address);
            assert(expectedBalance.eq(contractsDaiBalance), "Contract balance should increase when user deposits");
        });

        it("makes sure the total principal amount increases", async() => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            const principalBeforeDeposit = await goodGhosting.totalGamePrincipal();
            await goodGhosting.makeDeposit({ from: player1 });
            const principalAfterDeposit = await goodGhosting.totalGamePrincipal();
            const difference = principalAfterDeposit.sub(principalBeforeDeposit);
            assert(difference.eq(segmentPayment));
        });

        it("makes sure the player info stored in contract is updated", async() => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            await goodGhosting.makeDeposit({ from: player1 });
            const playerInfo = await goodGhosting.players(player1);
            assert(playerInfo.mostRecentSegmentPaid.eq(new BN(1)));
            assert(playerInfo.amountPaid.eq(segmentPayment.mul(new BN(2))));
            assert(playerInfo.canRejoin ===  false);
            assert(playerInfo.withdrawn ===  false);
        });

        it("makes sure that the winner array contains the player address that makes the last segment deposit", async() => {
            await joinGamePaySegmentsAndComplete(player1);
            const winner = await goodGhosting.winners(new BN(0));
            assert(winner === player1);
        });
    });

    describe("when a user withdraws before the end of the game", async () => {
        it("reverts if the contract is paused", async () => {
            await goodGhosting.pause({ from: admin });
            await truffleAssert.reverts(goodGhosting.earlyWithdraw({ from: player1 }), "Pausable: paused");
        });

        it("reverts if the game is completed", async () => {
            await advanceToEndOfGame();
            await truffleAssert.reverts(goodGhosting.earlyWithdraw({ from: player1 }), "Game is already completed");
        });

        it("reverts if a non-player tries to withdraw", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await truffleAssert.reverts(goodGhosting.earlyWithdraw({ from: nonPlayer }), "Player does not exist");
        });

        it("sets withdrawn flag to true after user withdraws before end of game", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.earlyWithdraw({ from: player1 });
            const player1Result = await goodGhosting.players.call(player1);
            assert(player1Result.withdrawn);
        });

        it("reverts if user tries to withdraw more than once", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.earlyWithdraw({ from: player1 });
            await truffleAssert.reverts(goodGhosting.earlyWithdraw({ from: player1 }), "Player has already withdrawn");
        });

        it("withdraws user balance subtracted by early withdraw fee", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);

            // Expect Player1 to get back their deposit minus the early withdraw fee defined in the constructor.
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            await goodGhosting.earlyWithdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);
            const feeAmount = segmentPayment.mul(new BN(fee)).div(new BN(100)); // fee is set as an integer, so needs to be converted to a percentage
            assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment.sub(feeAmount)));
        });

        it("fee collected from early withdrawal is part of segment deposit so it should generate interest", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.joinGame( { from: player2 });
            const principalAmountBeforeWithdraw = await goodGhosting.totalGamePrincipal();
            await goodGhosting.earlyWithdraw({ from: player1 });
            const principalAmount = await goodGhosting.totalGamePrincipal();
            // the principal amount when deducted during an early withdraw does not include fees since the fee goes to admin if there are no winners or is admin fee % > 0
            // so we check since segment deposit funds do generate interest so we check that segment deposit should be more than the principal
            assert(principalAmountBeforeWithdraw.gt(principalAmount));

        });


        it("withdraws user balance subtracted by early withdraw fee when not enough withdrawable balance in the contract", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            // Expect Player1 to get back their deposit minus the early withdraw fee defined in the constructor.
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            await goodGhosting.earlyWithdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);
            const feeAmount = segmentPayment.mul(new BN(fee)).div(new BN(100)); // fee is set as an integer, so needs to be converted to a percentage
            assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment.sub(feeAmount)));
        });

        it("emits EarlyWithdrawal event when user withdraws before end of game", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            const result = await goodGhosting.earlyWithdraw({ from: player1 });
            truffleAssert.eventEmitted(
                result,
                "EarlyWithdrawal",
                (ev) => ev.player === player1,
                "player unable to withdraw in between the game",
            );
        });

        it("reverts if user tries to pay next segment after early withdraw", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.earlyWithdraw({ from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Player already withdraw from game");
        });

        it("user is able to withdraw in the last segment", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
            for (let index = 1; index < segmentCount; index++) {
                await timeMachine.advanceTime(weekInSecs);
                if (index === segmentCount - 1) {
                    const result = await goodGhosting.earlyWithdraw({ from: player1 });
                    truffleAssert.eventEmitted(
                        result,
                        "EarlyWithdrawal",
                        (ev) => ev.player === player1,
                        "player unable to withdraw in between the game",
                    );
                } else {
                    // protocol deposit of the prev. deposit
                    await approveDaiToContract(player1);
                    await goodGhosting.makeDeposit({ from: player1 });
                }
            }
        });

        it("user is able to withdraw in the last segment when 2 players join the game and one of them early withdraws when the segment amount is less than withdraw amount", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.joinGame( { from: player2 });

            // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
            for (let index = 1; index < segmentCount; index++) {
                await timeMachine.advanceTime(weekInSecs);
                await approveDaiToContract(player1);
                await goodGhosting.makeDeposit({ from: player1 });
                // protocol deposit of the prev. deposit
                await approveDaiToContract(player2);
                await goodGhosting.makeDeposit({ from: player2 });
            }
            const result = await goodGhosting.earlyWithdraw({ from: player1 });
            truffleAssert.eventEmitted(
                result,
                "EarlyWithdrawal",
                (ev) => ev.player === player1,
                "player unable to withdraw in between the game",
            );
        });
    });

    describe("when an user tries to redeem from the external pool", async () => {
        it("reverts if game is not completed", async () => {
            await truffleAssert.reverts(goodGhosting.redeemFromExternalPool({ from: player1 }), "Game is not completed");
        });

        it("reverts if funds were already redeemed", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await truffleAssert.reverts(goodGhosting.redeemFromExternalPool({ from: player1 }), "Redeem operation already happened for the game");
        });

        it("allows anyone to redeem from external pool when game is completed", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            truffleAssert.passes(goodGhosting.redeemFromExternalPool({ from: nonPlayer }), "Couldn't redeem from external pool");
        });

        it("transfer funds to contract then redeems from external pool", async () => {
            const expectedBalance = web3.utils.toBN(segmentPayment * segmentCount);
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: player2 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            // No interest is generated during tests so far, so contract balance must equals the amount deposited.
            assert(expectedBalance.eq(contractsDaiBalance));
        });

        it("emits event FundsRedeemedFromExternalPool when redeem is successful", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            const totalPrincipal = web3.utils.toBN(segmentPayment * segmentCount);
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            const adminFeeAmount = ((new BN(contractsDaiBalance).sub(totalPrincipal)).mul(new BN(adminFee))).div(new BN(100));
            const expectedInterestValue = new BN(contractsDaiBalance).sub(totalPrincipal).sub(adminFeeAmount);
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => (
                    new BN(ev.totalAmount).eq(new BN(contractsDaiBalance)) &&
                    new BN(ev.totalGamePrincipal).eq(totalPrincipal) &&
                    new BN(ev.totalGameInterest).eq(expectedInterestValue) &&
                    new BN(ev.rewards).eq(new BN(0)) &&
                    new BN(ev.totalIncentiveAmount).eq(new BN(0))
                ),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });

        it("checks the interest is updated correctly when admin fees is more than 0%", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            const principalAmount = await goodGhosting.totalGamePrincipal();
            const totalInterest = await goodGhosting.totalGameInterest();
            const adminFeeAmount = ((new BN(contractsDaiBalance).sub(new BN(principalAmount))).mul(new BN(adminFee))).div(new BN(100));
            const expectedValue = new BN(contractsDaiBalance).sub(new BN(principalAmount)).sub(adminFeeAmount);
            assert(new BN(totalInterest).eq(expectedValue));
        });

        it("checks the interest is updated correctly when admin fees is 0 %", async () => {
            goodGhosting = await GoodGhosting.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                0,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                { from: admin },
            );
            await joinGamePaySegmentsAndComplete(player1);
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            const principalAmount = await goodGhosting.totalGamePrincipal();
            const totalInterest = await goodGhosting.totalGameInterest();
            const expectedValue = new BN(contractsDaiBalance).sub(new BN(principalAmount));
            assert(new BN(totalInterest).eq(expectedValue));
        });

        it("checks totalIncentiveAmount is set when additional incentives are sent to the contract", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            const principalAmount = await goodGhosting.totalGamePrincipal();
            const totalInterest = await goodGhosting.totalGameInterest();
            const adminFeeAmount = ((new BN(contractsDaiBalance).sub(new BN(principalAmount))).mul(new BN(adminFee))).div(new BN(100));
            const expectedValue = new BN(contractsDaiBalance).sub(new BN(principalAmount)).sub(adminFeeAmount);
            assert(new BN(totalInterest).eq(expectedValue));
        });

        it("emits WinnersAnnouncement event when redeem is successful", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            truffleAssert.eventEmitted(result, "WinnersAnnouncement", (ev) => {
                return ev.winners[0] === player1;
            }, "WinnersAnnouncement event should be emitted when funds are redeemed from external pool");
        });

        context("when incentive token is defined", async () => {
            const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            const incentiveAmount = new BN(toWad(10));
            let contract;
            let incentiveToken;

            beforeEach(async () => {
                incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
                aToken = await IERC20.at(await pap.getLendingPool.call());
                await pap.setUnderlyingAssetAddress(token.address);
                contract = await GoodGhosting.new(
                    token.address,
                    pap.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    0,
                    pap.address,
                    "115792089237316195423570985008687907853269984665640564039457584007913129639935", // equals to 2**256-1
                    incentiveToken.address,
                    { from: admin },
                );
            });

            it("sets totalIncentiveAmount to amount sent to contract", async () => {
                await incentiveToken.mint(contract.address, incentiveAmount.toString(), { from: admin });
                await token.approve(contract.address, approvalAmount, { from: player1 });
                await joinGamePaySegmentsAndComplete(player1, contract);
                await contract.redeemFromExternalPool({ from: player1 });
                const result = new BN(await contract.totalIncentiveAmount.call());
                assert(result.eq(incentiveAmount), `totalIncentiveAmount should be ${incentiveAmount.toString()}; received ${result.toString()}`);
            });

            it("sets totalIncentiveAmount to zero if no amount is sent to contract", async () => {
                await token.approve(contract.address, approvalAmount, { from: player1 });
                await joinGamePaySegmentsAndComplete(player1, contract);
                await contract.redeemFromExternalPool({ from: player1 });
                const result = new BN(await contract.totalIncentiveAmount.call());
                assert(result.eq(new BN(0)), `totalIncentiveAmount should be 0; received ${result.toString()}`);
            });
        });

    });

    describe("when no one wins the game", async () => {
        it("transfers interest to the owner in case no one wins", async () => {
            await joinGameMissLastPaymentAndComplete(player1);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            const adminBalance = await token.balanceOf(admin);
            const principalBalance = await token.balanceOf(goodGhosting.address);
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => new BN(ev.totalGameInterest).eq(new BN(adminBalance)) && new BN(ev.totalGamePrincipal).eq(new BN(principalBalance)),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });

        it("transfers principal to the user in case no one wins", async () => {
            const incompleteSegment = segmentCount - 1;
            const amountPaidInGame = web3.utils.toBN(segmentPayment * incompleteSegment);
            await joinGameMissLastPaymentAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const result = await goodGhosting.withdraw({ from: player1 });

            truffleAssert.eventEmitted(
                result,
                "Withdrawal",
                (ev) => ev.player === player1 && web3.utils.toBN(ev.amount).eq(amountPaidInGame),
                "Withdrawal event should be emitted when user tries to withdraw their principal",
            );
        });
    });

    describe("when an user tries to withdraw", async () => {
        it("reverts if user tries to withdraw more than once", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await goodGhosting.withdraw({ from: player1 });
            await truffleAssert.reverts(goodGhosting.withdraw({ from: player1 }), "Player has already withdrawn");
        });

        it("reverts if user tries to withdraw before the game ends", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await truffleAssert.reverts(goodGhosting.withdraw({ from: player1 }), "Game is not completed");
        });

        it("reverts if a non-player tries to withdraw", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await truffleAssert.reverts(goodGhosting.withdraw({ from: nonPlayer }), "Player does not exist");
        });

        it("reverts if a player tries withdraw after doing an early withdraw", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.earlyWithdraw({from: player1});
            await advanceToEndOfGame();
            await truffleAssert.reverts(goodGhosting.withdraw({ from: player1 }), "Player has already withdrawn");
        });

        it("user is able to withdraw when the contract is paused", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await advanceToEndOfGame();
            await goodGhosting.pause({ from: admin });
            await goodGhosting.withdraw({ from: player1 });
        });

        it("sets withdrawn flag to true after user withdraws", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await goodGhosting.withdraw({ from: player1 });
            const player1Result = await goodGhosting.players.call(player1);
            assert(player1Result.withdrawn);
        });

        it("withdraws from external pool on first withdraw if funds weren't redeemed yet", async () => {
            const expectedAmount = web3.utils.toBN(segmentPayment * segmentCount);
            await joinGamePaySegmentsAndComplete(player1);
            const result = await goodGhosting.withdraw({ from: player1 });
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => web3.utils.toBN(ev.totalAmount).eq(expectedAmount),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });

        it("makes sure the player that withdraws first before funds are redeemed from external pool gets equal interest (if winner)", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player2 });
            await goodGhosting.joinGame( { from: player1 });
            for (let index = 1; index < segmentCount; index++) {
                await timeMachine.advanceTime(weekInSecs);
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);
                await goodGhosting.makeDeposit({ from: player1 });
                await goodGhosting.makeDeposit({ from: player2 });
            }
            // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
            // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
            await timeMachine.advanceTime(weekInSecs);
            await timeMachine.advanceTime(weekInSecs);
            await mintTokensFor(admin);
            const incentiveAmount = toWad(1000);
            await token.approve(pap.address, incentiveAmount, { from: admin });
            await pap.deposit(token.address, incentiveAmount, pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });

            const player1BeforeWithdrawBalance = await token.balanceOf(player1);
            await goodGhosting.withdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);
            const player1WithdrawAmount = player1PostWithdrawBalance.sub(player1BeforeWithdrawBalance);

            const player2BeforeWithdrawBalance = await token.balanceOf(player2);
            await goodGhosting.withdraw({ from: player2 });
            const player2PostWithdrawBalance = await token.balanceOf(player2);
            const player2WithdrawAmount = player2PostWithdrawBalance.sub(player2BeforeWithdrawBalance);

            const paidAmount = new BN(segmentCount).mul(new BN(segmentPayment));
            const adminFeeAmount = incentiveAmount.mul(new BN(adminFee)).div(new BN(100));
            const playerInterest = new BN(incentiveAmount.sub(adminFeeAmount)).div(new BN(2)); // 2 players in the game
            const expectedWithdrawalAmount = paidAmount.add(playerInterest);

            // both players are winners, so should withdraw the same amount.
            assert(player1WithdrawAmount.eq(player2WithdrawAmount));

            // amount withdrawn, should match expectedWithdrawalAmount
            assert(expectedWithdrawalAmount.eq(player1WithdrawAmount));
        });

        it("makes sure the winners get equal interest", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player2 });
            await goodGhosting.joinGame( { from: player1 });
            for (let index = 1; index < segmentCount; index++) {
                await timeMachine.advanceTime(weekInSecs);
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);

                await goodGhosting.makeDeposit({ from: player1 });
                await goodGhosting.makeDeposit({ from: player2 });

            }
            // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
            // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
            await timeMachine.advanceTime(weekInSecs);
            await timeMachine.advanceTime(weekInSecs);
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: admin });

            await goodGhosting.withdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);

            await goodGhosting.withdraw({ from: player2 });
            const player2PostWithdrawBalance = await token.balanceOf(player2);
            assert(player2PostWithdrawBalance.eq(player1PostWithdrawBalance));
        });

        it("pays a bonus to winners in form of early withdraw fees and losers get their principle back", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            const player2PreWithdrawBalance = await token.balanceOf(player1);

            await goodGhosting.joinGame( { from: player2 });
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.earlyWithdraw({ from: player2});
            for (let index = 1; index < segmentCount; index++) {
                await timeMachine.advanceTime(weekInSecs);
                // protocol deposit of the prev. deposit
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);

                await goodGhosting.makeDeposit({ from: player1 });
            }
            // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
            // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
            await timeMachine.advanceTime(weekInSecs);
            await timeMachine.advanceTime(weekInSecs);
            await goodGhosting.redeemFromExternalPool({ from: admin });

            await goodGhosting.withdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);

            const player2PostWithdrawBalance = await token.balanceOf(player2);
            assert(player1PostWithdrawBalance.gt(player1PreWithdrawBalance));
            assert(player2PostWithdrawBalance.lt(player2PreWithdrawBalance));
        });

        it("pays a bonus to winners in form of early withdraw fees and interest earned and losers get their principle back", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            const player2PreWithdrawBalance = await token.balanceOf(player1);

            await goodGhosting.joinGame( { from: player2 });
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.earlyWithdraw({ from: player2});
            for (let index = 1; index < segmentCount; index++) {
                await timeMachine.advanceTime(weekInSecs);
                // protocol deposit of the prev. deposit
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);

                await goodGhosting.makeDeposit({ from: player1 });
            }
            // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
            // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
            await timeMachine.advanceTime(weekInSecs);
            await timeMachine.advanceTime(weekInSecs);
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: admin });

            await goodGhosting.withdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);

            const player2PostWithdrawBalance = await token.balanceOf(player2);
            assert(player1PostWithdrawBalance.gt(player1PreWithdrawBalance));
            assert(player2PostWithdrawBalance.lt(player2PreWithdrawBalance));
        });

        it("pays a bonus to winners and losers get their principle back", async () => {
            // Player1 is out "loser" and their interest is Player2's bonus
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });

            // Player2 pays in all segments and is our lucky winner!
            await mintTokensFor(player2);
            await joinGamePaySegmentsAndComplete(player2);

            // Simulate some interest by giving the contract more aDAI
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });

            // Expect Player1 to get back the deposited amount
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            await goodGhosting.withdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);
            assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment));

            // Expect Player2 to get an amount greater than the sum of all the deposits
            const player2PreWithdrawBalance = await token.balanceOf(player2);
            await goodGhosting.withdraw({ from: player2 });
            const player2PostWithdrawBalance = await token.balanceOf(player2);
            const totalGameInterest = await goodGhosting.totalGameInterest.call();
            const adminFeeAmount = (new BN(adminFee).mul(totalGameInterest)).div(new BN("100"));
            const withdrawalValue = player2PostWithdrawBalance.sub(player2PreWithdrawBalance);

            const userDeposit = segmentPayment.mul(web3.utils.toBN(segmentCount));
            // taking in account the pool fees 5%
            assert(withdrawalValue.lte(userDeposit.add(toWad(1000)).sub(adminFeeAmount)));
        });

        it("emits Withdrawal event when user withdraws", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: admin });
            const result = await goodGhosting.withdraw({ from: player1 });
            truffleAssert.eventEmitted(result, "Withdrawal", (ev) => {
                return (
                    ev.player === player1 &&
                    new BN(ev.playerReward).eq(new BN(0)) &&
                    new BN(ev.playerIncentive).eq(new BN(0))
                );
            }, "unable to withdraw amount");
        });

        context("when incentive token is defined", async () => {
            const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            const incentiveAmount = new BN(toWad(10));
            let contract;
            let incentiveToken;

            beforeEach(async () => {
                incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
                aToken = await IERC20.at(await pap.getLendingPool.call());
                await pap.setUnderlyingAssetAddress(token.address);
                contract = await GoodGhosting.new(
                    token.address,
                    pap.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    0,
                    pap.address,
                    "115792089237316195423570985008687907853269984665640564039457584007913129639935", // equals to 2**256-1
                    incentiveToken.address,
                    { from: admin },
                );
            });

            it("pays additional incentive to winners when incentive is sent to contract", async () => {
                await incentiveToken.mint(contract.address, incentiveAmount.toString(), { from: admin });
                await token.approve(contract.address, approvalAmount, { from: player1 });
                await token.approve(contract.address, approvalAmount, { from: player2 });

                const player1IncentiveBalanceBefore = await incentiveToken.balanceOf(player1);
                const player2IncentiveBalanceBefore = await incentiveToken.balanceOf(player2);
                await contract.joinGame({ from: player2 });
                await joinGamePaySegmentsAndComplete(player1, contract);
                await contract.redeemFromExternalPool({ from: player1 });

                const resultPlayer2 = await contract.withdraw({ from: player2});
                const resultPlayer1 = await contract.withdraw({ from: player1 });

                const player1IncentiveBalanceAfter = await incentiveToken.balanceOf(player1);
                const player2IncentiveBalanceAfter = await incentiveToken.balanceOf(player2);

                assert(
                    player2IncentiveBalanceBefore.eq(player2IncentiveBalanceAfter),
                    "player2 incentive token balance should be equal before and after withdrawal",
                );
                assert(
                    player1IncentiveBalanceAfter.eq(player1IncentiveBalanceBefore.add(incentiveAmount)),
                    "player1 incentive balance should be equal to incentive sent",
                );

                truffleAssert.eventEmitted(resultPlayer2, "Withdrawal", (ev) => {
                    return (
                        ev.player === player2 &&
                        new BN(ev.playerReward).eq(new BN(0)) &&
                        new BN(ev.playerIncentive).eq(new BN(0))
                    );
                }, "invalid withdraw amounts for player 2");

                truffleAssert.eventEmitted(resultPlayer1, "Withdrawal", (ev) => {
                    return (
                        ev.player === player1 &&
                        new BN(ev.playerReward).eq(new BN(0)) &&
                        new BN(ev.playerIncentive).eq(incentiveAmount)
                    );
                }, "invalid withdraw amounts for player 1");
            });

            it("does not pay additional incentive to winners if incentive is not sent to contract", async () => {
                await token.approve(contract.address, approvalAmount, { from: player1 });
                await token.approve(contract.address, approvalAmount, { from: player2 });

                const player1IncentiveBalanceBefore = await incentiveToken.balanceOf(player1);
                const player2IncentiveBalanceBefore = await incentiveToken.balanceOf(player2);
                await contract.joinGame({ from: player2 });
                await joinGamePaySegmentsAndComplete(player1, contract);
                await contract.redeemFromExternalPool({ from: player1 });

                const resultPlayer2 = await contract.withdraw({ from: player2});
                const resultPlayer1 = await contract.withdraw({ from: player1 });

                const player1IncentiveBalanceAfter = await incentiveToken.balanceOf(player1);
                const player2IncentiveBalanceAfter = await incentiveToken.balanceOf(player2);

                assert(
                    player2IncentiveBalanceBefore.eq(player2IncentiveBalanceAfter),
                    "player2 incentive token balance should be equal before and after withdrawal",
                );
                assert(
                    player1IncentiveBalanceBefore.eq(player1IncentiveBalanceAfter),
                    "player1 incentive token balance should be equal before and after withdrawal",
                );

                truffleAssert.eventEmitted(resultPlayer2, "Withdrawal", (ev) => {
                    return (
                        ev.player === player2 &&
                        new BN(ev.playerReward).eq(new BN(0)) &&
                        new BN(ev.playerIncentive).eq(new BN(0))
                    );
                }, "invalid withdraw amounts for player 2");

                truffleAssert.eventEmitted(resultPlayer1, "Withdrawal", (ev) => {
                    return (
                        ev.player === player1 &&
                        new BN(ev.playerReward).eq(new BN(0)) &&
                        new BN(ev.playerIncentive).eq(new BN(0))
                    );
                }, "invalid withdraw amounts for player 1");
            });
        });
    });

    describe("admin tries to withdraw fees with admin percentage fee greater than 0", async () => {
        context("reverts", async () => {
            it("when funds were not redeemed from external pool", async () => {
                await joinGamePaySegmentsAndComplete(player1);
                await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "Funds not redeemed from external pool");
            });

            it("when game has not completed yet", async () => {
                await approveDaiToContract(player1);
                await goodGhosting.joinGame( { from: player1 });
                await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "Game is not completed");
            });

            it("when admin tries to withdraw fees again", async () => {
                await joinGamePaySegmentsAndComplete(player1);
                //generating mock interest
                await mintTokensFor(admin);
                await token.approve(pap.address, toWad(1000), { from: admin });
                await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
                await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                await goodGhosting.adminFeeWithdraw({ from: admin });
                await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "Admin has already withdrawn");
            });

            it("someone other than admin tries to withdraw the fees", async () => {
                await joinGamePaySegmentsAndComplete(player1);
                //generating mock interest
                await mintTokensFor(admin);
                await token.approve(pap.address, toWad(1000), { from: admin });
                await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
                await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: player1 }), "Ownable: caller is not the owner");
            });
        });

        context("with no winners in the game", async () => {

            it("does not revert when there is no interest generated (neither external interest nor early withdrawal fees)", async () => {
                await approveDaiToContract(player1);
                await goodGhosting.joinGame( { from: player1 });
                await advanceToEndOfGame();
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                const ZERO = new BN(0);
                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => ev.totalGameInterest.eq(ZERO) && ev.adminFeeAmount.eq(ZERO) && ev.adminIncentiveAmount.eq(ZERO)
                );
            });

            it("withdraw fees when there's only early withdrawal fees", async () => {
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);
                await goodGhosting.joinGame( { from: player1 });
                await goodGhosting.joinGame( { from: player2 });
                await timeMachine.advanceTimeAndBlock(weekInSecs);
                await goodGhosting.earlyWithdraw({ from: player1 });
                await advanceToEndOfGame();
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                const contractBalance = await token.balanceOf(goodGhosting.address);
                const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
                const grossInterest = contractBalance.sub(totalGamePrincipal);
                const regularAdminFee = grossInterest.mul(new BN(adminFee)).div(new BN(100));
                const gameInterest = await goodGhosting.totalGameInterest.call();
                // There's no winner, so admin takes it all
                const expectedAdminFee = regularAdminFee.add(gameInterest);
                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee)
                        && ev.adminIncentiveAmount.eq(new BN(0));
                    });
            });

            it("withdraw fees when there's only interest generated by external pool", async () => {
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);
                await goodGhosting.joinGame( { from: player1 });
                await goodGhosting.joinGame( { from: player2 });
                // mocks interest generation
                await mintTokensFor(admin);
                await token.approve(pap.address, toWad(1000), { from: admin });
                await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
                await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
                await advanceToEndOfGame();
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                const contractBalance = await token.balanceOf(goodGhosting.address);
                const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
                const grossInterest = contractBalance.sub(totalGamePrincipal);
                const regularAdminFee = grossInterest.mul(new BN(adminFee)).div(new BN(100));
                const gameInterest = await goodGhosting.totalGameInterest.call();
                // There's no winner, so admin takes it all
                const expectedAdminFee = regularAdminFee.add(gameInterest);
                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee)
                        && ev.adminIncentiveAmount.eq(new BN(0));
                    });
            });

            it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);
                await goodGhosting.joinGame( { from: player1 });
                await goodGhosting.joinGame( { from: player2 });
                await mintTokensFor(admin);
                await token.approve(pap.address, toWad(1000), { from: admin });
                await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
                await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
                await timeMachine.advanceTimeAndBlock(weekInSecs);
                await goodGhosting.earlyWithdraw({ from: player1 });
                await advanceToEndOfGame();
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                const contractBalance = await token.balanceOf(goodGhosting.address);
                const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
                const grossInterest = contractBalance.sub(totalGamePrincipal);
                const regularAdminFee = grossInterest.mul(new BN(adminFee)).div(new BN(100));
                const gameInterest = await goodGhosting.totalGameInterest.call();
                // There's no winner, so admin takes it all
                const expectedAdminFee = regularAdminFee.add(gameInterest);
                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee)
                        && ev.adminIncentiveAmount.eq(new BN(0));
                    });
            });

            it("withdraw incentives sent to contract", async () => {
                const incentiveAmount = new BN(toWad(10));
                const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
                const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
                aToken = await IERC20.at(await pap.getLendingPool.call());
                await pap.setUnderlyingAssetAddress(token.address);
                const contract = await GoodGhosting.new(
                    token.address,
                    pap.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    new BN(1),
                    pap.address,
                    "115792089237316195423570985008687907853269984665640564039457584007913129639935", // equals to 2**256-1
                    incentiveToken.address,
                    { from: admin },
                );

                await incentiveToken.mint(contract.address, incentiveAmount.toString(), { from: admin });
                await token.approve(contract.address, approvalAmount, { from: player1 });
                await contract.joinGame({ from: player1 });
                await advanceToEndOfGame();
                await contract.redeemFromExternalPool({ from: player1 });
                const incentiveBalanceBefore = await incentiveToken.balanceOf(admin);
                const result = await contract.adminFeeWithdraw({ from: admin });
                const incentiveBalanceAfter = await incentiveToken.balanceOf(admin);

                assert(
                    incentiveBalanceAfter.eq(incentiveBalanceBefore.add(incentiveAmount)),
                    "admin incentive balance should be equal to incentive sent",
                );

                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => ev.adminIncentiveAmount.eq(incentiveAmount)
                );
            });
        });

        context("with winners in the game", async () => {
            it("does not revert when there is no interest generated (neither external interest nor early withdrawal fees)", async () => {
                await joinGamePaySegmentsAndComplete(player1);
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                const ZERO = new BN(0);
                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => ev.totalGameInterest.eq(ZERO) && ev.adminFeeAmount.eq(ZERO) && ev.adminIncentiveAmount.eq(new BN(0))
                );
            });

            it("withdraw fees when there's only early withdrawal fees", async () => {
                await approveDaiToContract(player2);
                await goodGhosting.joinGame( { from: player2 });
                await goodGhosting.earlyWithdraw({ from: player2 });
                await joinGamePaySegmentsAndComplete(player1);
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                const contractBalance = await token.balanceOf(goodGhosting.address);
                const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
                const grossInterest = contractBalance.sub(totalGamePrincipal);
                const expectedAdminFee = grossInterest.mul(new BN(adminFee)).div(new BN(100));
                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(expectedAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee)
                        && ev.adminIncentiveAmount.eq(new BN(0));
                    });
            });

            it("withdraw fees when there's only interest generated by external pool", async () => {
                await joinGamePaySegmentsAndComplete(player1);
                //generating mock interest
                await mintTokensFor(admin);
                await token.approve(pap.address, toWad(1000), { from: admin });
                await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
                await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
                await goodGhosting.redeemFromExternalPool({ from: player1 });

                const contractBalance = await token.balanceOf(goodGhosting.address);
                const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
                const grossInterest = contractBalance.sub(totalGamePrincipal);
                const expectedAdminFee = grossInterest.mul(new BN(adminFee)).div(new BN(100));

                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(expectedAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee)
                        && ev.adminIncentiveAmount.eq(new BN(0));
                    });
            });

            it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
                await approveDaiToContract(player2);
                await goodGhosting.joinGame( { from: player2 });
                await goodGhosting.earlyWithdraw({ from: player2 });

                await joinGamePaySegmentsAndComplete(player1);
                //generating mock interest
                await mintTokensFor(admin);
                await token.approve(pap.address, toWad(1000), { from: admin });
                await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
                await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
                await goodGhosting.redeemFromExternalPool({ from: player1 });

                const contractBalance = await token.balanceOf(goodGhosting.address);
                const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
                const grossInterest = contractBalance.sub(totalGamePrincipal);
                const expectedAdminFee = grossInterest.mul(new BN(adminFee)).div(new BN(100));
                const gameInterest = await goodGhosting.totalGameInterest.call();

                console.log(contractBalance.toString());
                console.log(totalGamePrincipal.toString());
                console.log(grossInterest.toString());
                console.log(gameInterest.toString());
                console.log(expectedAdminFee.toString());

                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(expectedAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee)
                        && ev.adminIncentiveAmount.eq(new BN(0));
                    });
            });

            it("does not withdraw any incentives sent to contract", async () => {
                const incentiveAmount = new BN(toWad(10));
                const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
                const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
                aToken = await IERC20.at(await pap.getLendingPool.call());
                await pap.setUnderlyingAssetAddress(token.address);
                const contract = await GoodGhosting.new(
                    token.address,
                    pap.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    new BN(1),
                    pap.address,
                    "115792089237316195423570985008687907853269984665640564039457584007913129639935", // equals to 2**256-1
                    incentiveToken.address,
                    { from: admin },
                );

                await incentiveToken.mint(contract.address, incentiveAmount.toString(), { from: admin });
                await token.approve(contract.address, approvalAmount, { from: player1 });
                await joinGamePaySegmentsAndComplete(player1, contract);
                await contract.redeemFromExternalPool({ from: player1 });
                const incentiveBalanceBefore = await incentiveToken.balanceOf(admin);
                const result = await contract.adminFeeWithdraw({ from: admin });
                const incentiveBalanceAfter = await incentiveToken.balanceOf(admin);

                assert(
                    incentiveBalanceAfter.eq(incentiveBalanceBefore),
                    "admin incentive balance before game should be equal to balance after game",
                );

                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => ev.adminIncentiveAmount.eq(new BN(0))
                );
            });
        });
    });

    describe("admin tries to withdraw fees with admin percentage fee equal to 0 and no winners", async () => {
        beforeEach(async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            goodGhosting = await GoodGhosting.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                0,
                pap.address,
                maxPlayersCount,
                ZERO_ADDRESS,
                { from: admin },
            );
        });

        it("does not revert when there is no interest generated", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            //generating mock interest
            await mintTokensFor(goodGhosting.address);
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractBalance = await token.balanceOf(goodGhosting.address);
            const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
            const grossInterest = contractBalance.sub(totalGamePrincipal);
            const ZERO = new BN(0);
            const result = await goodGhosting.adminFeeWithdraw({ from: admin });
            truffleAssert.eventEmitted(
                result,
                "AdminWithdrawal",
                (ev) => ev.totalGameInterest.eq(grossInterest) && ev.adminFeeAmount.eq(ZERO) && ev.adminIncentiveAmount.eq(ZERO)
            );
        });

        it("withdraw fees when there's only interest generated by external pool", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.joinGame( { from: player2 });
            // mocks interest generation
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await advanceToEndOfGame();
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractBalance = await token.balanceOf(goodGhosting.address);
            const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
            const grossInterest = contractBalance.sub(totalGamePrincipal);
            const gameInterest = await goodGhosting.totalGameInterest.call();
            const result = await goodGhosting.adminFeeWithdraw({ from: admin });
            truffleAssert.eventEmitted(
                result,
                "AdminWithdrawal",
                (ev) => {
                    return ev.totalGameInterest.eq(grossInterest)
                    && ev.adminFeeAmount.eq(gameInterest)
                    && ev.adminIncentiveAmount.eq(new BN(0));
                });
        });

        it("withdraw fees when there's only early withdraw fees and no winners in the game", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.joinGame( { from: player2 });
            await goodGhosting.earlyWithdraw({ from: player1 });
            await goodGhosting.earlyWithdraw({ from: player2 });
            await advanceToEndOfGame();
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractBalance = await token.balanceOf(goodGhosting.address);
            const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
            const grossInterest = contractBalance.sub(totalGamePrincipal);
            const gameInterest = await goodGhosting.totalGameInterest.call();
            const result = await goodGhosting.adminFeeWithdraw({ from: admin });
            // admin takes all fees in case of no winners
            truffleAssert.eventEmitted(
                result,
                "AdminWithdrawal",
                (ev) => {
                    return ev.totalGameInterest.eq(grossInterest)
                    && ev.adminFeeAmount.eq(gameInterest)
                    && ev.adminIncentiveAmount.eq(new BN(0));
                });
        });

        it("withdraw fees when there are both early withdraw fees and interest and no winners in the game", async () => {
            await approveDaiToContract(player1);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame( { from: player1 });
            await goodGhosting.joinGame( { from: player2 });
            await goodGhosting.earlyWithdraw({ from: player1 });
            // mocks interest generation
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await advanceToEndOfGame();
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractBalance = await token.balanceOf(goodGhosting.address);
            const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
            const grossInterest = contractBalance.sub(totalGamePrincipal);
            const gameInterest = await goodGhosting.totalGameInterest.call();
            const result = await goodGhosting.adminFeeWithdraw({ from: admin });
            // admin takes all fees in case of no winners
            truffleAssert.eventEmitted(
                result,
                "AdminWithdrawal",
                (ev) => {
                    return ev.totalGameInterest.eq(grossInterest)
                    && ev.adminFeeAmount.eq(gameInterest)
                    && ev.adminIncentiveAmount.eq(new BN(0));
                });
        });

        it("withdraw incentives sent to contract", async () => {
            const incentiveAmount = new BN(toWad(10));
            const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            const contract = await GoodGhosting.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                new BN(0),
                pap.address,
                "115792089237316195423570985008687907853269984665640564039457584007913129639935", // equals to 2**256-1
                incentiveToken.address,
                { from: admin },
            );

            await incentiveToken.mint(contract.address, incentiveAmount.toString(), { from: admin });
            await token.approve(contract.address, approvalAmount, { from: player1 });
            await contract.joinGame({ from: player1 });
            await advanceToEndOfGame();
            await contract.redeemFromExternalPool({ from: player1 });
            const incentiveBalanceBefore = await incentiveToken.balanceOf(admin);
            const result = await contract.adminFeeWithdraw({ from: admin });
            const incentiveBalanceAfter = await incentiveToken.balanceOf(admin);

            assert(
                incentiveBalanceAfter.eq(incentiveBalanceBefore.add(incentiveAmount)),
                "admin incentive balance should be equal to incentive sent",
            );

            truffleAssert.eventEmitted(
                result,
                "AdminWithdrawal",
                (ev) => ev.adminIncentiveAmount.eq(incentiveAmount)
            );
        });
    });

    describe("as a Pausable contract", async () => {
        describe("checks Pausable access control", async () => {
            it("does not revert when admin invokes pause()", async () => {
                truffleAssert.passes(goodGhosting.pause({ from: admin }), "Ownable: caller is owner but failed to pause the contract");
            });

            it("does not revert when admin invokes unpause()", async () => {
                await goodGhosting.pause({ from: admin });
                truffleAssert.passes(goodGhosting.unpause({ from: admin }), "Ownable: caller is owner but failed to unpause the contract");
            });

            it("reverts when non-admin invokes pause()", async () => {
                await truffleAssert.reverts(goodGhosting.pause({ from: player1 }), "Ownable: caller is not the owner");
            });

            it("reverts when non-admin invokes unpause()", async () => {
                await goodGhosting.pause({ from: admin });
                await truffleAssert.reverts(goodGhosting.unpause({ from: player1 }), "Ownable: caller is not the owner");
            });
        });

        describe("checks Pausable contract default behavior", () => {
            beforeEach(async function () {
                await goodGhosting.pause({ from: admin });
            });

            describe("checks Pausable contract default behavior", () => {
                it("pauses the contract", async () => {
                    const result = await goodGhosting.paused.call({ from: admin });
                    assert(result, "contract is not paused");
                });

                it("unpauses the contract", async () => {
                    await goodGhosting.unpause({ from: admin });
                    const result = await goodGhosting.pause.call({ from: admin });
                    assert(result, "contract is paused");
                });
            });
        });
    });

});
