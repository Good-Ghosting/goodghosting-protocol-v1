const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("MockERC20Mintable");
const GoodGhosting = artifacts.require("GoodGhosting");
const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { web3tx, toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

contract("GoodGhosting", (accounts) => {
    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let aToken;
    let goodGhosting;
    let pap;
    let player1 = accounts[1];
    let player2 = accounts[2];
    const weekInSecs = 180;
    const fee = 9;
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(10)); // equivalent to 10 DAI
    const segmentCount = 6;
    const segmentLength = 180;

    beforeEach(async () => {
        global.web3 = web3;
        token = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")("MINT", "MINT", {from: admin});
        // creates dai for player1 to hold.
        // Note DAI contract returns value to 18 Decimals
        // so token.balanceOf(address) should be converted with BN
        // and then divided by 10 ** 18
        await mintTokensFor(player1);
        pap = await web3tx(LendingPoolAddressesProviderMock.new, "LendingPoolAddressesProviderMock.new")("TOKEN_NAME", "TOKEN_SYMBOL", {from: admin});
        aToken = await IERC20.at(await pap.getLendingPool.call());
        await pap.setUnderlyingAssetAddress(token.address);
        goodGhosting = await web3tx(GoodGhosting.new, "GoodGhosting.new")(
            token.address,
            pap.address,
            segmentCount,
            segmentLength,
            segmentPayment,
            fee,
            {from: admin},
        );
    });

    async function mintTokensFor(player) {
        await web3tx(token.mint, `token.mint 100 -> ${player}`)(player, toWad(1000), {from: admin});
    }

    async function approveDaiToContract(fromAddr) {
        await web3tx(token.approve, "token.approve to send tokens to contract")(goodGhosting.address, segmentPayment, {from: fromAddr});
    }

    async function advanceToEndOfGame() {
        await timeMachine.advanceTime(weekInSecs * segmentCount);
    }

    async function joinGamePaySegmentsAndComplete(player) {
        await approveDaiToContract(player);
        await web3tx(goodGhosting.joinGame, "join game")({ from: player });
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player);
            await web3tx(goodGhosting.makeDeposit, "make a deposit")({ from: player });
        }
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
            const result = await goodGhosting.getCurrentSegment.call({from: admin});
            assert(
                result.eq(new BN(0)),
                `should start at segment ${expectedSegment} but started at ${result.toNumber()} instead.`,
            );
        });
    });

    describe("when the time passes for a game", async () => {
        it("checks if the game segments are correctly tracked", async () => {
            let result = -1;
            for (let expectedSegment = 0; expectedSegment < segmentCount; expectedSegment++) {
                result = await goodGhosting.getCurrentSegment.call({from: admin});
                assert(
                    result.eq(new BN(expectedSegment)),
                    `expected segment ${expectedSegment} actual ${result.toNumber()}`,
                );
                await timeMachine.advanceTimeAndBlock(weekInSecs);
            }
        });
    });

    describe("when an user tries to join a game", async () => {
        it("reverts if the contract is paused", async () => {
            await goodGhosting.pause({ from: admin });
            truffleAssert.reverts(goodGhosting.joinGame({ from: player1 }), "Pausable: paused");
        });

        it("reverts if the user tries to join after the first segment", async () => {
            await timeMachine.advanceTime(weekInSecs);
            await approveDaiToContract(player1);
            truffleAssert.reverts(goodGhosting.joinGame({from: player1}), "game has already started");
        });

        it("reverts if the user tries to join the game twice", async () => {
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.joinGame, "join game")({from: player1});
            await approveDaiToContract(player1);
            truffleAssert.reverts(goodGhosting.joinGame({from: player1}), "The player should not have joined the game before");
        });

        it("stores the player(s) who joined the game", async ()=>{
            // Player1 joins the game
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.joinGame,"join the game")({ from: player1 });
            // Mints DAI for player2 (not minted in the beforeEach hook) and joins the game
            await mintTokensFor(player2);
            await approveDaiToContract(player2);
            await web3tx(goodGhosting.joinGame,"join the game")({ from: player2 });

            // Reads stored players and compares against player1 and player2
            // Remember: "iterablePlayers" is an array, so we need to pass the index we want to retrieve.
            const storedPlayer1 = await goodGhosting.iterablePlayers.call(0);
            const storedPlayer2 = await goodGhosting.iterablePlayers.call(1);
            assert(storedPlayer1 === player1);
            assert(storedPlayer2 === player2);
        });

        it("emits the event JoinedGame", async () => {
            await approveDaiToContract(player1);
            const result = await web3tx(goodGhosting.joinGame, "join game")({from: player1});
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
            truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Pausable: paused");
        });

        it("reverts if the game is completed", async () => {
            await advanceToEndOfGame();
            truffleAssert.reverts(goodGhosting.makeDeposit({ from: player1 }), "Game is already completed");
        });

        it("reverts if user didn't join the game", async () => {
            await approveDaiToContract(player1);
            truffleAssert.reverts(goodGhosting.makeDeposit({from: player1}), "Sender is not a player");
        });

        it("reverts if user is making a deposit for the first segment", async () => {
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.joinGame, "join game")({from: player1});
            await approveDaiToContract(player1);
            truffleAssert.reverts(goodGhosting.makeDeposit({from: player1}), "Deposits start after the first segment");
        });

        it("reverts if user is making a duplicated deposit for the same segment", async () => {
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.joinGame, "join game")({from: player1});
            // Moves to the next segment
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.makeDeposit, "makeDeposit")({from: player1});
            await approveDaiToContract(player1);
            truffleAssert.reverts(goodGhosting.makeDeposit({from: player1}), "Player already paid current segment");
        });

        it("reverts if user forgot to deposit for a previous segment", async () => {
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.joinGame, "join game")({from: player1});
            await timeMachine.advanceTime(weekInSecs * 2);
            await approveDaiToContract(player1);
            truffleAssert.reverts(goodGhosting.makeDeposit({from: player1}), "Player didn't pay the previous segment - game over!");
        });

        it("user can deposit successfully if all requirements are met", async () => {
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.joinGame, "join game")({from: player1});
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            await approveDaiToContract(player1);
            const result = await web3tx(goodGhosting.makeDeposit, "depositing for segment 2")({from: player1});
            truffleAssert.eventEmitted(
                result,
                "Deposit",
                (ev) => ev.player === player1,
                "player unable to deposit for segment 2 when all requirements were met",
            );
        });
    });

    describe("when a user withdraw in between the game",  async () => {
        it("user can withdraw in between successfully", async () => {
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.joinGame, "join game")({from: player1});
            await timeMachine.advanceTimeAndBlock(weekInSecs);
            const result = await web3tx(goodGhosting.emergencyWithdraw, "doing an emergency withdrawal before game ends")({from: player1});
            truffleAssert.eventEmitted(
                result,
                "EmergencyWithdrawal",
                (ev) => ev.player === player1,
                "player unable to withdraw in between the game",
            );
        });
    })

    describe("when an user tries to redeem from the external pool", async () => {
        it("reverts if game is not completed", async () => {
            truffleAssert.reverts(goodGhosting.redeemFromExternalPool({ from: player1 }), "Game is not completed");
        });

        it("reverts if funds were already redeemed", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            truffleAssert.reverts(goodGhosting.redeemFromExternalPool({ from: player1 }), "Redeem operation already happened for the game");
        });

        it("allows to redeem from external pool when game is completed", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            truffleAssert.passes(goodGhosting.redeemFromExternalPool);
        });

        it("emits event FundsRedeemedFromExternalPool when redeem is successful", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            const result = await web3tx(goodGhosting.redeemFromExternalPool, "redeem funds")({ from: player1 });
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => new BN(ev.totalAmount).eq(new BN(contractsDaiBalance)),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });

        it("emits WinnersAnnouncement event when redeem is successful", async () => { // having test with only 1 player for now
            await joinGamePaySegmentsAndComplete(player1);
            const result = await web3tx(goodGhosting.redeemFromExternalPool, "redeem funds")({ from: player1 });
            truffleAssert.eventEmitted(result, "WinnersAnnouncement", (ev) => {
                return ev.winners[0] === player1;
            }, "WinnersAnnouncement event should be emitted when funds are redeemed from external pool");
        });
    });

    describe("when an tries to withdraw", async () => {
        it("sets withdrawn flag to true after user withdraws", async () => { // having test with only 1 player for now
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.withdraw({from: player1});
            const player1Result = await goodGhosting.players.call(player1);
            assert(player1Result.withdrawn);
        });

        it("pays a bonus to winners and losers get their principle back", async () => {
            // Player1 is out "loser" and their interest is Player2's bonus
            await approveDaiToContract(player1);
            await web3tx(goodGhosting.joinGame,"join the game")({ from: player1 });

            // Player2 pays in all segments and is our lucky winner!
            await mintTokensFor(player2);
            await joinGamePaySegmentsAndComplete(player2);

            // Simulate some interest by giving the contract more aDAI
            await mintTokensFor(admin);
            await web3tx(token.approve, `token.approve 100 -> ${pap.address}`)(pap.address, toWad(1000), {from: admin});
            await web3tx(pap.deposit, "pap.deposit 100")(token.address, toWad(1000), 0, {from: admin});
            await web3tx(aToken.transfer, "aToken.transfer 100")(goodGhosting.address, toWad(1000), {from: admin});

            // Expect Player1 to get back their deposit
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            await goodGhosting.withdraw({from: player1});
            const player1PostWithdrawBalance = await token.balanceOf(player1);
            assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment));

            // Expect Player2 to get greater than the sum of all deposits
            const player2PreWithdrawBalance = await token.balanceOf(player2);
            await goodGhosting.withdraw({from: player2});
            const player2PostWithdrawBalance = await token.balanceOf(player2);

            const withdrawalValue = player2PostWithdrawBalance.sub(player2PreWithdrawBalance);
            const userDeposit = segmentPayment.mul(web3.utils.toBN(segmentCount));
            assert(withdrawalValue.eq(userDeposit.add(toWad(1000))));
        });

        it("emits Withdrawal event when user withdraws", async () => { // having test with only 1 player for now
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({from: admin});
            const result = await web3tx(goodGhosting.withdraw, "withdraw funds")({from: player1});
            truffleAssert.eventEmitted(result, "Withdrawal", (ev) => {
                return ev.player === player1;
            }, "unable to withdraw amount");
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
                truffleAssert.reverts(goodGhosting.pause({ from: player1 }), "Ownable: caller is not the owner");
            });

            it("reverts when non-admin invokes unpause()", async () => {
                await goodGhosting.pause({ from: admin });
                truffleAssert.reverts(goodGhosting.unpause({ from: player1 }), "Ownable: caller is not the owner");
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
