const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("MockERC20Mintable");
const GoodGhosting = artifacts.require("GoodGhosting");
const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const whitelistedPlayerConfig = [
    {"0xf17f52151EbEF6C7334FAD080c5704D77216b732": {index: 1, proof: ["0x2882c9f01add5f1c877ca051d110e9e58fbedc3164a1ae605f2fb231e9d9fb70"] }},
    {'0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef': {index: 0, proof: ["0x93e8909af44acf5e2128ec9b84e3ba358ce1de36b5c9d6f9c61e14bb89a1d5f2"] }},
    // invalid user
    {'0x821aEa9a577a9b44299B9c15c88cf3087F3b5544': {index: 3, proof: ["0x45533c7da4a9f550fb2a9e5efe3b6db62261670807ed02ce75cb871415d708cc","0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef","0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"]}}

]

contract("GoodGhosting", (accounts) => {

    // Only executes this test file for local network fork
    if (process.env.NETWORK === "local-mainnet-fork") return;

    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let aToken;
    let goodGhosting;
    let pap;
    let player1 = accounts[1];
    let player2 = accounts[2];
    let player3 = accounts[3];
    const weekInSecs = 180;
    const fee = 9; // represents 9%
    const adminFee = 5; // represents 5%
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(10)); // equivalent to 10 DAI
    const segmentCount = 6;
    const segmentLength = 180;

    beforeEach(async () => {
        global.web3 = web3;
        token = await ERC20Mintable.new("MINT", "MINT", { from: admin });
        // creates dai for player1 to hold.
        // Note DAI contract returns value to 18 Decimals
        // so token.balanceOf(address) should be converted with BN
        // and then divided by 10 ** 18
        await mintTokensFor(player1);
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
            "0xd53ed7372825e2b21778b03e7f08246a9e358bf89416c856ebb4f196fca5e662",
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
        // it was just the first deposit window and game was not started yet.
        await timeMachine.advanceTime(weekInSecs * (segmentCount + 1));
    }

    async function joinGamePaySegmentsAndComplete(player, index, proof) {
        await approveDaiToContract(player);
        await goodGhosting.joinGame(index, proof, { from: player });
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
            await timeMachine.advanceTime(weekInSecs);
            // protocol deposit of the prev. deposit
            await goodGhosting.depositIntoExternalPool({ from: player1 });
            await approveDaiToContract(player);
            await goodGhosting.makeDeposit({ from: player });
        }
        // accounted for 1st deposit window
        // the loop will run till segmentCount - 1
        // after that funds for the last segment are deposited to protocol then we wait for segment length to deposit to the protocol
        // and another segment where the last segment deposit can generate yield
        await timeMachine.advanceTime(weekInSecs);
        await goodGhosting.depositIntoExternalPool({ from: player1 });
        await timeMachine.advanceTime(weekInSecs);
    }

    async function joinGamePaySegmentsAndCompleteWithoutExternalDeposits(player, index, proof) {
        await approveDaiToContract(player);
        await goodGhosting.joinGame(index, proof, { from: player });
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
            await timeMachine.advanceTime(weekInSecs);
            // no protocol deposit of the prev. deposit
            await approveDaiToContract(player);
            await goodGhosting.makeDeposit({ from: player });
        }
        // accounted for 1st deposit window
        // the loop will run till segmentCount - 1
        // after that funds for the last segment are deposited to protocol then we wait for segment length to deposit to the protocol
        // and another segment where the last segment deposit can generate yield
        await timeMachine.advanceTime(weekInSecs);
        // no protocol deposit of the prev. deposit
        await timeMachine.advanceTime(weekInSecs);
    }

    async function joinGamePaySegmentsAndIncomplete(player, index, proof) {
        await approveDaiToContract(player);
        await goodGhosting.joinGame(index, proof, { from: player });
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount - 1; index++) {
            await timeMachine.advanceTime(weekInSecs);
            // protocol deposit of the prev. deposit
            await goodGhosting.depositIntoExternalPool({ from: player1 });
            await approveDaiToContract(player);
            await goodGhosting.makeDeposit({ from: player });
        }
        await timeMachine.advanceTime(weekInSecs);
        // protocol deposit of the prev. deposit
        await goodGhosting.depositIntoExternalPool({ from: player1 });
        // accounted for 1st deposit window
        // the loop will run till segmentCount - 1
        // after that funds for the last segment are deposited to protocol then we wait for segment length to deposit to the protocol
        // and another segment where the last segment deposit can generate yield
        await timeMachine.advanceTime(weekInSecs);
        await timeMachine.advanceTime(weekInSecs);
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
            await truffleAssert.reverts(GoodGhosting.new(
                token.address,
                pap.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                0,
                adminFee,
                pap.address,
                "0xd53ed7372825e2b21778b03e7f08246a9e358bf89416c856ebb4f196fca5e662",
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
                "0xd53ed7372825e2b21778b03e7f08246a9e358bf89416c856ebb4f196fca5e662",
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
                "0xd566243e283f1357e5e97dd0c9ab0d78177583074b440cb07815e05f615178bf",
                { from: admin },
            ));
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
            assert(inboundCurrencyResult === token.address, `Inbound currency doesn't match. expected ${token.address}; got ${inboundCurrencyResult}`);
            assert(interestCurrencyResult === aToken.address, `Interest currency doesn't match. expected ${aToken.address}; got ${interestCurrencyResult}`);
            assert(lendingPoolAddressProviderResult === pap.address, `LendingPoolAddressesProvider doesn't match. expected ${pap.address}; got ${lendingPoolAddressProviderResult}`);
            assert(new BN(lastSegmentResult).eq(new BN(segmentCount)), `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`);
            assert(new BN(segmentLengthResult).eq(new BN(segmentLength)), `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`);
            assert(new BN(segmentPaymentResult).eq(new BN(segmentPayment)), `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`);
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
                // console.log(`currentSegment: ${currentSegment}`);
                // console.log(`isGameCompleted: ${result}`);
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
            await truffleAssert.reverts(goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "Pausable: paused");
        });

        it("reverts if user does not approve the contract to spend dai", async () => {
            await truffleAssert.reverts(goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "You need to have allowance to do transfer DAI on the smart contract");
        })

        it("reverts if the user tries to join after the first segment", async () => {
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "Game has already started");
        });

        it("reverts when a non-whitelisted player tries to join the game", async() => {
            await truffleAssert.reverts(goodGhosting.joinGame(whitelistedPlayerConfig[2][player3].index, whitelistedPlayerConfig[2][player3].proof, { from: player3 }), "MerkleDistributor: Invalid proof.");
        })

        it("reverts if the user tries to join the game twice", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "Cannot join the game more than once");
        });

        it("stores the player(s) who joined the game", async () => {
            // Player1 joins the game
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            // Mints DAI for player2 (not minted in the beforeEach hook) and joins the game
            await mintTokensFor(player2);
            await approveDaiToContract(player2);
            await goodGhosting.joinGame(whitelistedPlayerConfig[1][player2].index, whitelistedPlayerConfig[1][player2].proof, { from: player2 });

            // Reads stored players and compares against player1 and player2
            // Remember: "iterablePlayers" is an array, so we need to pass the index we want to retrieve.
            const storedPlayer1 = await goodGhosting.iterablePlayers.call(0);
            const storedPlayer2 = await goodGhosting.iterablePlayers.call(1);
            assert(storedPlayer1 === player1);
            assert(storedPlayer2 === player2);
        });

        it("transfers the first payment to the contract", async () => {
            // Player1 joins the game
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            assert(contractsDaiBalance.eq(segmentPayment), "Contract balance should increase when user joins the game");
        });

        it("emits the event JoinedGame", async () => {
            await approveDaiToContract(player1);
            const result = await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
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
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Deposit available only between segment 1 and segment n-1 (penultimate)");
        });

        it("reverts if user is making a deposit during segment n (last segment)", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            // Advances to last segment
            await timeMachine.advanceTime(weekInSecs * segmentCount);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Deposit available only between segment 1 and segment n-1 (penultimate)");
        });

        it("reverts if user is making a duplicated deposit for the same segment", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            // Moves to the next segment
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player1);
            await goodGhosting.makeDeposit({ from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Player already paid current segment");
        });

        it("reverts if user forgot to deposit for previous segment", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTime(weekInSecs * 2);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Player didn't pay the previous segment - game over!");
        });

        it("user can deposit successfully if all requirements are met", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
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
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            await goodGhosting.makeDeposit({ from: player1 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            assert(expectedBalance.eq(contractsDaiBalance), "Contract balance should increase when user deposits");
        });
    });

    describe("when depositing funds into external pool ", async () => {
        it("reverts if the contract is paused", async () => {
            await goodGhosting.pause({ from: admin });
            await truffleAssert.reverts(goodGhosting.depositIntoExternalPool({ from: player1 }), "Pausable: paused");
        });

        it("reverts if the game is completed", async () => {
            await advanceToEndOfGame();
            await truffleAssert.reverts(goodGhosting.depositIntoExternalPool({ from: player1 }), "Game is already completed");
        });

        it("reverts if tries to make deposit during segment 0 (first deposit window)", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await truffleAssert.reverts(goodGhosting.depositIntoExternalPool({ from: player1 }), "Cannot deposit into underlying protocol during segment zero");
        });

        it("reverts if there's no amount from previous segment to be deposited", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.depositIntoExternalPool({ from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await truffleAssert.reverts(goodGhosting.depositIntoExternalPool({ from: player1 }), "No amount from previous segment to deposit into protocol");
        });

        it("reverts if trying to deposit more than once for the same segment", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.depositIntoExternalPool({ from: player1 });
            await truffleAssert.reverts(goodGhosting.depositIntoExternalPool({ from: player1 }), "No amount from previous segment to deposit into protocol");
        });

        it("deposits funds successfully when all requirements are met", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await truffleAssert.passes(goodGhosting.depositIntoExternalPool);
        });

        it("emits FundsDepositedIntoExternalPool event for a successful deposit", async () => {
            const expectedAmount = web3.utils.toBN(segmentPayment);
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            const result = await goodGhosting.depositIntoExternalPool({ from: player1 });
            truffleAssert.eventEmitted(
                result,
                "FundsDepositedIntoExternalPool",
                (ev) => web3.utils.toBN(ev.amount).eq(expectedAmount),
                "FundsDepositedIntoExternalPool events was not emitted",
            );
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

        it("sets withdrawn flag to true after user withdraws before end of game", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.earlyWithdraw({ from: player1 });
            const player1Result = await goodGhosting.players.call(player1);
            assert(player1Result.withdrawn);
        });

        it("reverts if user tries to withdraw more than once", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.earlyWithdraw({ from: player1 });
            await truffleAssert.reverts(goodGhosting.earlyWithdraw({ from: player1 }), "Player has already withdrawn");
        });

        it("withdraws user balance subtracted by early withdraw fee", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);

            // Expect Player1 to get back their deposit minus the early withdraw fee defined in the constructor.
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            await goodGhosting.earlyWithdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);
            const feeAmount = segmentPayment.mul(new BN(fee)).div(new BN(100)); // fee is set as an integer, so needs to be converted to a percentage
            assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment.sub(feeAmount)));
        });

        it("withdraws user balance subtracted by early withdraw fee when not enough withdrawable balance in the contract", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.depositIntoExternalPool({ from: player1 });
            // Expect Player1 to get back their deposit minus the early withdraw fee defined in the constructor.
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            await goodGhosting.earlyWithdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);
            const feeAmount = segmentPayment.mul(new BN(fee)).div(new BN(100)); // fee is set as an integer, so needs to be converted to a percentage
            assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment.sub(feeAmount)));
        });

        it("emits EarlyWithdrawal event when user withdraws before end of game", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
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
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await goodGhosting.earlyWithdraw({ from: player1 });
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Player already withdraw from game");
        });

        it("reverts if user tries to rejoin game after doing an early withdraw during Segment 0", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });
            await goodGhosting.earlyWithdraw({ from: player1 });
            await approveDaiToContract(player1);
            await truffleAssert.reverts(goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 }), "Cannot join the game more than once");
        });
    });

    describe("when an user tries to redeem from the external pool", async () => {
        it("reverts if game is not completed", async () => {
            await truffleAssert.reverts(goodGhosting.redeemFromExternalPool({ from: player1 }), "Game is not completed");
        });

        it("reverts if funds were already redeemed", async () => {
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await truffleAssert.reverts(goodGhosting.redeemFromExternalPool({ from: player1 }), "Redeem operation already happened for the game");
        });

        it("allows to redeem from external pool when game is completed", async () => {
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            truffleAssert.passes(goodGhosting.redeemFromExternalPool, "Couldn't redeem from external pool");
        });

        it("transfer funds to contract then redeems from external pool", async () => {
            const expectedBalance = web3.utils.toBN(segmentPayment * segmentCount);
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            await goodGhosting.redeemFromExternalPool({from: player2});
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            // No interest is generated during tests so far, so contract balance must equals the amount deposited.
            assert(expectedBalance.eq(contractsDaiBalance));
        });

        it("emits event FundsRedeemedFromExternalPool when redeem is successful", async () => {
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => new BN(ev.totalAmount).eq(new BN(contractsDaiBalance)),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });

        it("emits WinnersAnnouncement event when redeem is successful", async () => { // having test with only 1 player for now
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            truffleAssert.eventEmitted(result, "WinnersAnnouncement", (ev) => {
                return ev.winners[0] === player1;
            }, "WinnersAnnouncement event should be emitted when funds are redeemed from external pool");
        });
    });

    describe("when an user tries to redeem from the external pool when no external deposits are made", async () => {

        it("emits event FundsRedeemedFromExternalPool when redeem is successful", async () => {
            await joinGamePaySegmentsAndCompleteWithoutExternalDeposits(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => new BN(ev.totalAmount).eq(new BN(contractsDaiBalance)),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });
    });

    describe("when no one wins the game", async () => {
        it("transfers interest to the owner in case no one wins", async () => { // having test with only 1 player for now
            await joinGamePaySegmentsAndIncomplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
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
            await joinGamePaySegmentsAndIncomplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const result = await goodGhosting.withdraw({ from: player1 });

            truffleAssert.eventEmitted(
                result,
                "Withdrawal",
                (ev) => ev.player === player1 && web3.utils.toBN(ev.amount).eq(amountPaidInGame),
                "Withdrawal event should be emitted when user tries to withdraw their principal",
            );
        })
    })

    describe("when an user tries to withdraw", async () => {
        it("reverts if user tries to withdraw more than once", async () => {
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await goodGhosting.withdraw({ from: player1 });
            await truffleAssert.reverts(goodGhosting.withdraw({ from: player1 }), "Player has already withdrawn");
        });

        it("sets withdrawn flag to true after user withdraws", async () => {
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await goodGhosting.withdraw({ from: player1 });
            const player1Result = await goodGhosting.players.call(player1);
            assert(player1Result.withdrawn);
        });

        it("withdraws from external pool on first withdraw if funds weren't redeemed yet", async () => {
            const expectedAmount = web3.utils.toBN(segmentPayment * segmentCount);
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            const result = await goodGhosting.withdraw({ from: player1 });
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => web3.utils.toBN(ev.totalAmount).eq(expectedAmount),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });

        it("pays a bonus to winners and losers get their principle back", async () => {
            // Player1 is out "loser" and their interest is Player2's bonus
            await approveDaiToContract(player1);
            await goodGhosting.joinGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, { from: player1 });

            // Player2 pays in all segments and is our lucky winner!
            await mintTokensFor(player2);
            await joinGamePaySegmentsAndComplete(player2, whitelistedPlayerConfig[1][player2].index, whitelistedPlayerConfig[1][player2].proof);

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
            const adminFeeAmount = (new BN(adminFee).mul(totalGameInterest)).div(new BN('100'));
            const withdrawalValue = player2PostWithdrawBalance.sub(player2PreWithdrawBalance)

            const userDeposit = segmentPayment.mul(web3.utils.toBN(segmentCount));
            // taking in account the pool fees 5%
            assert(withdrawalValue.lte(userDeposit.add(toWad(1000)).sub(adminFeeAmount)));
        });

        it("emits Withdrawal event when user withdraws", async () => { // having test with only 1 player for now
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            await goodGhosting.redeemFromExternalPool({ from: admin });
            const result = await goodGhosting.withdraw({ from: player1 });
            truffleAssert.eventEmitted(result, "Withdrawal", (ev) => {
                return ev.player === player1;
            }, "unable to withdraw amount");
        });
    });

    describe("when admin tries to withdraw the fee amount when admin fee is non 0", async () => {
        it ("reverts if admin tries to withdraw fees again", async () => {
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            //generating mock interest
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await goodGhosting.adminFeeWithdraw({ from: admin });
            await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "Admin has already withdrawn");
        })

        it ("reverts when there is no interest generated", async () => {
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "No Fees Earned");
        })

        it ("admin is able to withdraw fee amount", async () => {
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
            //generating mock interest
            await mintTokensFor(admin);
            await token.approve(pap.address, toWad(1000), { from: admin });
            await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const result = await goodGhosting.adminFeeWithdraw({ from: admin });
            truffleAssert.eventEmitted(
                result,
                "AdminWithdrawal",
                (ev) => {
                    const adminFeeAmount = (new BN(adminFee).mul(ev.totalGameInterest).div(new BN('100')));
                    return adminFeeAmount.lte(ev.adminFeeAmount);
                })
        })
    })

    describe("when admin tries to withdraw the fee amount when admin fee is 0", async () => {
        it ("reverts when there is no interest generated", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
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
                "0xd53ed7372825e2b21778b03e7f08246a9e358bf89416c856ebb4f196fca5e662",
                { from: admin },
            );
            await joinGamePaySegmentsAndComplete(player1, whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof);
             //generating mock interest
             await mintTokensFor(goodGhosting.address);
             await mintTokensFor(admin);
             await token.approve(pap.address, toWad(1000), { from: admin });
             await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
             await goodGhosting.redeemFromExternalPool({ from: player1 });
            await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "No Fees Earned");
        })
    })

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
