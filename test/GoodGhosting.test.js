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
        await web3tx(token.mint, "token.mint 100 -> player1")(player1, toWad(1000), {from: admin});
        pap = await web3tx(LendingPoolAddressesProviderMock.new, "LendingPoolAddressesProviderMock.new")("TOKEN_NAME", "TOKEN_SYMBOL", {from: admin});
        aToken = await IERC20.at(await pap.getLendingPool.call());
        await pap.setUnderlyingAssetAddress(token.address);
        goodGhosting = await web3tx(GoodGhosting.new, "GoodGhosting.new")(
            token.address,
            aToken.address,
            pap.address,
            segmentCount,
            segmentLength,
            segmentPayment,
            {from: admin},
        );
    });

    async function approveDaiToContract(fromAddr) {
        await web3tx(token.approve, "token.approve to send tokens to contract")(goodGhosting.address, segmentPayment, {from: fromAddr});
    }

    async function advanceToEndOfGame() {
        await timeMachine.advanceTime(weekInSecs * segmentCount);
    }

    async function joinGamePaySegmentsAndComplete(player) {
        console.log('joinGamePaySegmentsAndComplete');
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
            await web3tx(token.mint, "token.mint 100 -> player2")(player2, toWad(1000), {from: admin});
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


    // 🤝 intergration test
    // 🚨 Finish this test so its working with BN.js
    // it("users can deposit first segment when they join", async () => {
    //     await approveDaiToContract(player1);

    //     await web3tx(bank.joinGame, "join game")({ from: player1 });

    //     // await timeMachine.advanceTimeAndBlock(weekInSecs + 1);

    //     // await web3tx(
    //     //     bank.makeDeposit,
    //     //     "token.approve to send tokens to contract"
    //     // )({
    //     //     from: player1,
    //     // });

    //     const contractsDaiBalance = await token.balanceOf(bank.address);
    //     const contractsADaiBalance = await aToken.balanceOf(bank.address);
    //     const player = await bank.players(player1);
    //     console.log(
    //         "console.log",
    //         contractsADaiBalance,
    //         contractsDaiBalance,
    //         player.amountPaid.toString()
    //     );
    //     assert(contractsDaiBalance.eq(web3.utils.toBN(0)), "Contract DAI Balance should be 0")
    //     // here we should expect to see that the user has paid in 10 aDAI to the Good Ghosting
    //     // smart contract.
    //     // I think the smart contrat is correct, but i need to test this correctly with BN.js
    //     // assert(contractsADaiBalance.eq(expectedAmount), `expected: ${expectedAmount}  actual: ${contractsADaiBalance}`)
    //     // assert(contractsDaiBalance.eq(web3.utils.toBN(0)), `expected: ${expectedAmount}  actual: ${contractsADaiBalance}`)

    // });

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

    it("redeems amount after all segments are over", async () => { // having test with only 1 player for now
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

    it("unable to redeem before game ends", async () => { // having test with only 1 player for now
        await approveDaiToContract(player1);
        await web3tx(goodGhosting.joinGame, "join game")({from: player1});
        truffleAssert.reverts(goodGhosting.redeemFromExternalPool({from: player1}), "Game is not completed");
    });

    it("allocate withdraw amounts", async () => { // having test with only 1 player for now
        await joinGamePaySegmentsAndComplete(player1);
        await web3tx(goodGhosting.redeemFromExternalPool, "redeem funds")({ from: player1 });
        const result = await web3tx(goodGhosting.allocateWithdrawAmounts, "allocate withdraw amount")({ from: player1 });

        truffleAssert.eventEmitted(result, "WinnersAnnouncement", (ev) => {
            return ev.winners[0] === player1;
        }, "unable to allocate withdraw amounts");
    });

    it("unable to allocate withdraw amounts", async () => { // having test with only 1 player for now
        await approveDaiToContract(player1);
        await web3tx(goodGhosting.joinGame, "join game")({from: player1});
        await timeMachine.advanceTime(weekInSecs);
        await approveDaiToContract(player1);
        await web3tx(goodGhosting.makeDeposit, "make a deposit")({from: player1});
        truffleAssert.reverts(goodGhosting.allocateWithdrawAmounts({from: player1}), "Funds not redeemed from external pool yet");
    });

    it("user is able to withdraw amount", async () => { // having test with only 1 player for now
        await joinGamePaySegmentsAndComplete(player1);
        await web3tx(goodGhosting.redeemFromExternalPool, "redeem funds")({from: admin});
        await web3tx(goodGhosting.allocateWithdrawAmounts, "allocate withdraw amount")({from: admin});
        const result = await web3tx(goodGhosting.withdraw, "withdraw funds")({from: player1});

        truffleAssert.eventEmitted(result, "Withdrawal", (ev) => {
            return ev.player === player1;
        }, "unable to withdraw amount");
    });

    it("user unable to withdraw amount", async () => { // having test with only 1 player for now
        await approveDaiToContract(player1);
        await web3tx(goodGhosting.joinGame, "join game")({from: player1});
        await timeMachine.advanceTime(weekInSecs);
        await approveDaiToContract(player1);
        await web3tx(goodGhosting.makeDeposit, "make a deposit")({from: player1});
        await advanceToEndOfGame();
        await web3tx(goodGhosting.redeemFromExternalPool, "redeem funds")({from: admin});
        truffleAssert.reverts(goodGhosting.withdraw({from: player1}), "No balance available for withdrawal");
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
