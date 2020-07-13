const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("ERC20Mintable");
const GoodGhosting = artifacts.require("GoodGhosting");
const LendingPoolAddressesProviderMock = artifacts.require(
    "LendingPoolAddressesProviderMock"
);
const { web3tx, wad4human, toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const BigNumber = require("bignumber.js");
// const BN = require('bn.js');

contract("GoodGhosting", (accounts) => {
    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn

    const admin = accounts[0];
    let token;
    let aToken;
    let bank;
    let pap;
    let player1 = accounts[1];
    let player2 = accounts[2];
    const weekInSecs = 604800;
    const numberOfSegments = 16;
    const daiDecimals =  web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(10));

    beforeEach(async () => {
        global.web3 = web3;
        token = await web3tx(
            ERC20Mintable.new,
            "ERC20Mintable.new"
        )({
            from: admin,
        });
        let usersDaiBalance = await token.balanceOf(player1);
        console.log("start users balance", new BigNumber(usersDaiBalance).toFixed());
        // creates dai for player1 to hold.
        // Note DAI contract returns value to 18 Decimals
        // so token.balanceOf(address) should be converted with BN
        // and then divided by 10 ** 18
        await web3tx(token.mint, "token.mint 100 -> player1")(
            player1,
            toWad(100),
            {
                from: admin,
            }
        );
        pap = await web3tx(
            LendingPoolAddressesProviderMock.new,
            "LendingPoolAddressesProviderMock.new"
        )({ from: admin });
        aToken = await IERC20.at(await pap.getLendingPool.call());
        await pap.setUnderlyingAssetAddress(token.address);
        bank = await web3tx(GoodGhosting.new, "GoodGhosting.new")(
            token.address,
            aToken.address,
            pap.address,
            {
                from: admin,
            }
        );
    });

    async function approveDaiToContract(fromAddr) {
        await web3tx(token.approve, "token.approve to send tokens to contract")(
            bank.address,
            segmentPayment,
            {
                from: fromAddr,
            }
        );
    }

    it("dai and adai are two seperate addresses", async () => {
        const daiAdd = token.address;
        const aDaiAdd = pap.address;
        assert(
            daiAdd != aDaiAdd,
            `DAI ${daiAdd} and ADAI ${aDaiAdd} the same address `
        );
    });

    it("contract starts holding 0 Dai and 0 aDai", async () => {
        const contractsDaiBalance = await token.balanceOf(bank.address);
        const contractsADaiBalance = await pap.balanceOf(bank.address);
        assert(
            contractsDaiBalance.toNumber() === 0 &&
                contractsDaiBalance.toNumber() === 0,
            `at game start, smart contract holds: ${contractsDaiBalance.toNumber()} DAI, ${contractsADaiBalance.toNumber()} ADAI`
        );
    });

    it("user starts holding more than 100 Dai", async () => {
        const usersDaiBalance = await token.balanceOf(player1);
    
        assert(
            new BigNumber(usersDaiBalance)/daiDecimals >= 100 ,
            `User has 100 or less dai at start, balance: ${usersDaiBalance}`
        );
    });

    it("can calculate current segment", async () => {
        // 🚨 TODO refactor to function - unsure why this is not workin
        let result = await bank.testGetCurrentSegment.call({from : admin});
        assert(result.toNumber() === 0, ` expected ${0}  actual ${result.toNumber()}`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

        result = await bank.testGetCurrentSegment.call({from : admin});
        assert(result.toNumber() === 1, `expected ${1}  actual ${result.toNumber()}`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

        result = await bank.testGetCurrentSegment.call({from : admin});
        assert(result.toNumber() === 2, `expected ${2}  actual ${result.toNumber()}`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

        result = await bank.testGetCurrentSegment.call({from : admin})
        assert(result.toNumber() === 3, `expected ${3}  actual ${result.toNumber()}`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);

        result = await bank.testGetCurrentSegment.call({from : admin});
        assert(result.toNumber() === 4, `expected ${4}  actual ${result.toNumber()}`);
        await timeMachine.advanceTimeAndBlock(weekInSecs);
    });
    // 🤝 intergration test
    // 🚨 To be finished
    it("users can deposit adai after one time segment has passed", async () => {
        await web3tx(bank.joinGame, "join game")({ from: player1 });

        await timeMachine.advanceTimeAndBlock(weekInSecs + 1);
        approveDaiToContract(player1);

        const result = await web3tx(
            bank.makeDeposit,
            "token.approve to send tokens to contract"
        )({
            from: player1,
        });
        // 10000000000000000000
        // 10000000000000000000

        const contractsDaiBalance = await token.balanceOf(bank.address);
        const contractsADaiBalance = await aToken.balanceOf(bank.address);
        const player = await bank.players(player1);
        const expectedAmount = new BN(10000000000000000000);
        console.log(contractsADaiBalance, contractsADaiBalance, player, expectedAmount);
        assert(contractsADaiBalance.eq(expectedAmount), `expected: ${expectedAmount}  actual: ${contractsADaiBalance}`)
        assert(contractsDaiBalance.eq(web3.utils.toBN(0)), `expected: ${expectedAmount}  actual: ${contractsADaiBalance}`)
        
        // assert((contractsDaiBalance.toNumber()=== 0),
        //     `contract did not recieve dai - DAI ${contractsDaiBalance.toString()} ADAI ${contractsADaiBalance.toString()}`
        // );
        // assert(
        //     player.mostRecentSegmentPaid.toNumber() === 1,
        //     `did not increment most recent segement played, expected 1, actual ${player.mostRecentSegmentPaid}`
        // );
        // assert(
        //     player.amountPaid.toNumber() === 10,
        //     `did not increment amount paid. Expected 10, actual ${player.amountPaid.toNumber()}`
        // );
        // truffleAssert.eventEmitted(
        //     result,
        //     "SendMessage",
        //     (ev) => {
        //         return ev.message === "payment made" && ev.receiver === player1;
        //     },
        //     "did not emit payment made message"
        // );
        // truffleAssert.eventNotEmitted(
        //     result,
        //     "SendMessage",
        //     (ev) => {
        //         return (
        //             ev.message === "too early to pay" && ev.receiver === player1
        //         );
        //     },
        //     "did not emit to early to pay messgae"
        // );
    });

    it("users can not deposit straight away", async () => {
        await web3tx(bank.joinGame, "join game")({ from: player1 });
        approveDaiToContract(player1);

        truffleAssert.reverts(
            bank.makeDeposit({ from: player1 }),
            "too early to pay"
        );
    });

    it("users can join the game in the first week", async () => {
        const result = await web3tx(
            bank.joinGame,
            "join the game"
        )({ from: player1 });
        truffleAssert.eventEmitted(
            result,
            "SendMessage",
            (ev) => {
                return ev.message === "game joined" && ev.receiver === player1;
            },
            "player was not able to join in the first segment"
        );
   
    });

    it("users cannot join after the first segment", async () => {
        await timeMachine.advanceTime(weekInSecs + 1);
        truffleAssert.reverts(
            bank.joinGame({ from: player1 }),
            "game has already started"
        );
    });

    it("registered players can call deposit after first segment is finnished", async () => {
        await web3tx(bank.joinGame, "join game")({ from: player1 });
        await timeMachine.advanceTime(weekInSecs);
        approveDaiToContract(player1);
        const result = web3tx(
            bank.makeDeposit,
            "make a deposit"
        )({ from: player1 });
        assert(result, "registered player could not make deposit");
    });

    it("unregistered players can not call deposit", async () => {
        approveDaiToContract(player2);

        truffleAssert.reverts(
            bank.makeDeposit({ from: player2 }),
            "not registered"
        );
    });

    it("users can not play if they missed paying in to the previous segment", async () => {
        await web3tx(bank.joinGame, "join game")({ from: player1 });
        const overTwoWeeks = weekInSecs * 2 + 1;
        await timeMachine.advanceTime(overTwoWeeks);
        await approveDaiToContract(player1);
        truffleAssert.reverts(
            bank.makeDeposit({ from: player1 }),
            "previous segment was not paid - out of game"
        );
    });

    it("when a user calls makeDeposit after the last segment, the payout process is started", async()=>{
        await web3tx(bank.joinGame, "join game")({ from: player1 });
        await timeMachine.advanceTime(weekInSecs * (numberOfSegments + 1));
        const result = await web3tx(
            bank.makeDeposit,
            "join the game"
        )({ from: player1 });

        truffleAssert.eventEmitted(
            result,
            "SendMessage",
            (ev) => {
                return ev.message === "payout process starting" && ev.receiver === player1;
            },
            "makeDeposit did not start payout process after segments finshed"
        );

    });

    // 🤝 Intergration test
    // pay in once, then fast forward to the game end. User should get 
    // back their single payment
    it("payback the right amount", async()=>{

        const usersInitialDaiBalance = await token.balanceOf(player1);
        console.log("usersInitialDaiBalance :", new BigNumber(usersInitialDaiBalance).toNumber());
        await web3tx(bank.joinGame, "join game")({ from: player1 });

        async function segmentPaymentMock(){
            await timeMachine.advanceTime(weekInSecs);
            approveDaiToContract(player1);
            await web3tx(
                bank.makeDeposit,
                "join the game"
            )({ from: player1 });
        }
        await segmentPaymentMock();
        await segmentPaymentMock();
        await segmentPaymentMock();
        const usersDaiBalanceBeforePayout = new BigNumber(await token.balanceOf(player1));
        await timeMachine.advanceTime(weekInSecs * numberOfSegments);
        const result = await web3tx(
            bank.makeDeposit,
            "join the game"
        )({ from: player1 });

        truffleAssert.eventEmitted(
            result,
            "SendMessage",
            (ev) => {
                return ev.message === "payout process starting" && ev.receiver === player1;
            },
            "makeDeposit did not start payout process after segments finshed"
        );
        const player = await bank.players(player1);
        console.log("player :", player);
        console.log("bug numer ", new BigNumber(player.amountPaid).toNumber());
        const usersDaiBalanceAfterPayout = new BigNumber(await token.balanceOf(player1));
        const amountPaid = new BigNumber(30);
        console.log("usersDai Balance before", usersDaiBalanceBeforePayout);
        const expectedBalance = usersDaiBalanceBeforePayout.plus(amountPaid);
        console.log("expected balance", expectedBalance);
        console.log(usersDaiBalanceAfterPayout.toNumber(), expectedBalance.toNumber());
        assert(usersDaiBalanceAfterPayout === expectedBalance, `users not getting right amount back. Expected ${expectedBalance.toFixed()}  actual: ${usersDaiBalanceAfterPayout.toFixed()}`);
        

        








    });
});
