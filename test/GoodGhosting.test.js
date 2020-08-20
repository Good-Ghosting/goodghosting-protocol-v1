const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("ERC20Mintable");
const GoodGhosting = artifacts.require("GoodGhosting");
const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const {web3tx, toWad} = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

contract("GoodGhosting", (accounts) => {
    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let aToken;
    let bank;
    let pap;
    let player1 = accounts[1];
    let player2 = accounts[2];
    const weekInSecs = 180;
    const numberOfSegments = 2;
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(10)); // equivalent to 10 DAI

    beforeEach(async () => {
        global.web3 = web3;
        token = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")({from: admin});
        // creates dai for player1 to hold.
        // Note DAI contract returns value to 18 Decimals
        // so token.balanceOf(address) should be converted with BN
        // and then divided by 10 ** 18
        await web3tx(token.mint, "token.mint 100 -> player1")(player1, toWad(1000), {from: admin});
        pap = await web3tx(LendingPoolAddressesProviderMock.new, "LendingPoolAddressesProviderMock.new")("TOKEN_NAME", "TOKEN_SYMBOL", {from: admin});
        aToken = await IERC20.at(await pap.getLendingPool.call());
        await pap.setUnderlyingAssetAddress(token.address);
        bank = await web3tx(GoodGhosting.new, "GoodGhosting.new")(token.address, aToken.address, pap.address, {from: admin});
    });

    async function approveDaiToContract(fromAddr) {
        await web3tx(token.approve, "token.approve to send tokens to contract")(bank.address, segmentPayment, {from: fromAddr});
    }

    it("dai and adai are two seperate addresses", async () => {
        const daiAdd = token.address;
        const aDaiAdd = pap.address;
        assert(daiAdd != aDaiAdd, `DAI ${daiAdd} and ADAI ${aDaiAdd} the same address `);

    });

    it("contract starts holding 0 Dai and 0 aDai", async () => {
        const contractsDaiBalance = await token.balanceOf(bank.address);
        const contractsADaiBalance = await pap.balanceOf(bank.address);
        assert(contractsDaiBalance.toNumber() === 0 && contractsDaiBalance.toNumber() === 0, `at game start, smart contract holds: ${
            contractsDaiBalance.toNumber()
        } DAI, ${
            contractsADaiBalance.toNumber()
        } ADAI`);

    });

    it("user starts holding more than 100 Dai", async () => {
        const usersDaiBalance = await token.balanceOf(player1);

        assert(usersDaiBalance.div(daiDecimals).gte(new BN(1000)), `User has 100 or less dai at start, balance: ${usersDaiBalance}`);

    });

    it("can calculate current segment", async () => { // 🚨 TODO refactor to function - unsure why this is not workin
        let result = await bank.getCurrentSegment.call({from: admin});
        assert(result.isZero(), ` expected ${0}  actual ${
            result.toNumber()
        }`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

        result = await bank.getCurrentSegment.call({from: admin});
        assert(result.eq(new BN(1)), `expected ${1}  actual ${
            result.toNumber()
        }`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

        result = await bank.getCurrentSegment.call({from: admin});
        assert(result.eq(new BN(2)), `expected ${2}  actual ${
            result.toNumber()
        }`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

        result = await bank.getCurrentSegment.call({from: admin});
        assert(result.eq(new BN(3)), `expected ${3}  actual ${
            result.toNumber()
        }`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

        result = await bank.getCurrentSegment.call({from: admin});
        assert(result.eq(new BN(4)), `expected ${4}  actual ${
            result.toNumber()
        }`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

    });

    // 🤝 intergration test
    // 🚨 Finish this test so its working with BN.js
    // it("users can deposit first segment when they join", async () => {
    //     approveDaiToContract(player1);

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

    it("users can deposit after first segment", async () => {
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});

        await timeMachine.advanceTimeAndBlock(weekInSecs);

        approveDaiToContract(player1);

        const result = await web3tx(bank.makeDeposit, "depositing in 2nd segment")({from: player1});
        truffleAssert.eventEmitted(result, "Deposit", (ev) => {
            return ev.player === player1;
        }, "player was not able to deposit after first segment");

        // const contractsDaiBalance = await token.balanceOf(bank.address);
        // const contractsADaiBalance = await aToken.balanceOf(bank.address);
        // const player = await bank.players(player1);
        // console.log(
        //     "console.log",
        //     contractsADaiBalance,
        //     contractsDaiBalance,
        //     player.amountPaid.toString()
        // );
        // // here we should expect to see that the user has paid in 10 aDAI to the Good Ghosting
        // // smart contract.
        // // I think the4 smart contrat is correct, but i need to test this correctly with BN.js
        // // assert(contractsADaiBalance.eq(expectedAmount), `expected: ${expectedAmount}  actual: ${contractsADaiBalance}`)
        // assert(contractsDaiBalance.eq(web3.utils.toBN(0)), "Contract DAI Balance should be 0")

    });

    // join twice test
    it("a user cannot join the game twice", async () => {
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});

        approveDaiToContract(player1);


        truffleAssert.reverts(bank.joinGame({from: player2}), "The player should not have joined the game before");
    });

    // it("creates an iterable array for players in the game", async ()=>{
    //     // we can delete this functionally once The Graph subgraph is created
    //     await web3tx(
    //         bank.joinGame,
    //         "join the game"
    //     )({ from: player1 });

    //    await web3tx(
    //         bank.joinGame,
    //         "join the game"
    //     )({ from: player2 });
    //     const iterableArray = await bank.getPlayers.call({from : player1});
    //     assert(iterableArray[0]=== player1 && iterableArray[1]=== player2);
    // });

    it("users cannot join after the first segment", async () => {
        await timeMachine.advanceTime(weekInSecs);
        approveDaiToContract(player1);

        truffleAssert.reverts(bank.joinGame({from: player1}), "game has already started");

    });

    it("unregistered players can not call deposit", async () => {
        approveDaiToContract(player2);

        truffleAssert.reverts(bank.makeDeposit({from: player2}), "not registered");

    });

    it("users can not play if they missed paying in to the previous segment", async () => {
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});
        const overTwoWeeks = weekInSecs * 2 + 1;
        await timeMachine.advanceTime(overTwoWeeks);
        await approveDaiToContract(player1);
        truffleAssert.reverts(bank.makeDeposit({from: player1}), "previous segment was not paid - out of game");

    });


    it("redeems amount after all segments are over", async () => { // having test with only 1 player for now
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});
        await timeMachine.advanceTime(weekInSecs);
        approveDaiToContract(player1);

        await web3tx(bank.makeDeposit, "make a deposit")({from: player1});
        const result = await web3tx(bank.redeemFromExternalPool, "redeem funds")({from: admin});
        const contractsDaiBalance = await token.balanceOf(bank.address);
        truffleAssert.eventEmitted(result, "FundsRedeemedFromExternalPool", (ev) => {
            return ev.totalAmount === contractsDaiBalance;
        }, "unable to redeem");

    })

    it("unable to redeem before game ends", async () => { // having test with only 1 player for now
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});
        truffleAssert.reverts(bank.redeemFromExternalPool({from: player1}), "Game is not completed");
    })

    it("allocate withdraw amounts", async () => { // having test with only 1 player for now
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});
        await timeMachine.advanceTime(weekInSecs);
        approveDaiToContract(player1);
        await web3tx(bank.makeDeposit, "make a deposit")({from: player1});
        await web3tx(bank.redeemFromExternalPool, "redeem funds")({from: admin});
        await web3tx(bank.allocateWithdrawAmounts, "allocate withdraw amount")({from: admin});

        truffleAssert.eventEmitted(result, "WinnersAnnouncement", (ev) => {
            return ev.winners === [player1];
        }, "unable to allocate withdraw amounts")

    })

    it("unable to allocate withdraw amounts", async () => { // having test with only 1 player for now
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});
        await timeMachine.advanceTime(weekInSecs);
        approveDaiToContract(player1);
        await web3tx(bank.makeDeposit, "make a deposit")({from: player1});
        truffleAssert.reverts(bank.allocateWithdrawAmounts({from: player1}), "Funds not redeemed from external pool yet");
    })

    it("user is able to withdraw amount", async () => { // having test with only 1 player for now
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});
        await timeMachine.advanceTime(weekInSecs);
        approveDaiToContract(player1);
        await web3tx(bank.makeDeposit, "make a deposit")({from: player1});
        await web3tx(bank.redeemFromExternalPool, "redeem funds")({from: admin});
        await web3tx(bank.allocateWithdrawAmounts, "allocate withdraw amount")({from: admin});
        await web3tx(bank.withdraw, "withdraw funds")({from: player1});

        truffleAssert.eventEmitted(result, "Withdrawal", (ev) => {
            return ev.player === player1;
        }, "unable to withdraw amount")

    })

    it("user unable to withdraw amount", async () => { // having test with only 1 player for now
        approveDaiToContract(player1);
        await web3tx(bank.joinGame, "join game")({from: player1});
        await timeMachine.advanceTime(weekInSecs);
        approveDaiToContract(player1);
        await web3tx(bank.makeDeposit, "make a deposit")({from: player1});
        await web3tx(bank.redeemFromExternalPool, "redeem funds")({from: admin});
        truffleAssert.reverts(bank.withdraw({from: player1}), "no balance available for withdrawal");

    })

    describe("reverts when contract is paused", () => {
        beforeEach(async function () {
            await bank.pause({from: admin});
        });

        it("pauses the contract", async () => {
            const result = await bank.paused.call({from: admin});
            assert(result, "contract is not paused");
        });

        it("unpauses the contract", async () => {
            await bank.unpause({from: admin});
            const result = await bank.pause.call({from: admin});
            assert(result, "contract is paused");
        });

        it("reverts joinGame when contract is paused", async () => {
            truffleAssert.reverts(bank.joinGame({from: player1}), "Pausable: paused");
        });

        it("reverts makeDeposit when contract is paused", async () => {
            truffleAssert.reverts(bank.makeDeposit({from: player1}), "Pausable: paused");
        });

        it("reverts makePayout when contract is paused", async () => {
            truffleAssert.reverts(bank.makePayout({from: player1}), "Pausable: paused");
        });
    });

});
