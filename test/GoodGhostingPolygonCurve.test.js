/* global context */
const ERC20Mintable = artifacts.require("MockERC20Mintable");
const GoodGhostingPolygonCurve = artifacts.require("GoodGhostingPolygonCurve");
const IncentiveControllerMock = artifacts.require("IncentiveControllerMock");
const MockCurvePool = artifacts.require("MockCurvePool")
const MockCurveGauge = artifacts.require("MockCurveGauge")
const ethers = require('ethers')
const { toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

contract("GoodGhostingPolygonCurve", (accounts) => {
    // Only executes this test file IF NOT a local network fork
    if (["local-mainnet-fork", "local-celo-fork", "local-polygon-vigil-fork",  "local-polygon-vigil-fork-curve", "local-polygon-whitelisted-vigil-fork"].includes(process.env.NETWORK)) return;

    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let pool;
    let gauge;
    let curve;
    let goodGhosting;
    let incentiveController;
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
    const tokenPosition = 0;
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    beforeEach(async () => {
        global.web3 = web3;
        incentiveController = await IncentiveControllerMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
        token = await ERC20Mintable.new("MINT", "MINT", { from: admin });
        curve = await ERC20Mintable.new("CURVE", "CURVE", { from: admin });
        pool = await  MockCurvePool.new("LP", "LP", token.address, { from: admin});
        gauge = await  MockCurveGauge.new("GAUGE", "GAUGE", curve.address, pool.address, incentiveController.address, { from: admin});
        // creates dai for player1 to hold.
        // Note DAI contract returns value to 18 Decimals
        // so token.balanceOf(address) should be converted with BN
        // and then divided by 10 ** 18
        await mintTokensFor(player1);
        await mintTokensFor(player2);
        await mintRewardsFor(gauge.address)
        await curve.mint(gauge.address, toWad(1000), { from: admin });

        goodGhosting = await GoodGhostingPolygonCurve.new(
            token.address,
            pool.address,
            tokenPosition,
            tokenPosition,
            gauge.address,
            segmentCount,
            segmentLength,
            segmentPayment,
            fee,
            adminFee,
            maxPlayersCount,
            curve.address,
            incentiveController.address,
            ZERO_ADDRESS,
            { from: admin },
        );
    });

    async function mintTokensFor(player) {
        await token.mint(player, toWad(1000), { from: admin });
    }

    async function mintRewardsFor(to) {
        await incentiveController.mint(to, toWad(1000), { from: admin });
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

    async function joinGamePaySegmentsAndComplete(player, contractInstance) {
        let contract = contractInstance;
        if (!contract) {
            contract = goodGhosting;
        }
        await approveDaiToContract(player);
        await contract.joinGame( { from: player });
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
        await goodGhosting.joinGame( { from: player });
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

        it("checks if player1 received minted DAI tokens", async () => {
            const usersDaiBalance = await token.balanceOf(player1);
            // BN.gte => greater than or equals (see https://github.com/indutny/bn.js/)
            assert(usersDaiBalance.div(daiDecimals).gte(new BN(1000)), `Player1 balance should be greater than or equal to 100 DAI at start - current balance: ${usersDaiBalance}`);
        });

        it("reverts if the contract is deployed with invalid pool address", async () => {
            await truffleAssert.reverts(GoodGhostingPolygonCurve.new(
                token.address,
                ZERO_ADDRESS,
                tokenPosition,
                tokenPosition,
                gauge.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                adminFee,
                maxPlayersCount,
                curve.address,
                incentiveController.address,
                ZERO_ADDRESS,
                { from: admin },
            ),
            "invalid _pool address");
        });

        it("reverts if the contract is deployed with invalid gauge address", async () => {
            await truffleAssert.reverts(GoodGhostingPolygonCurve.new(
                token.address,
                pool.address,       
                tokenPosition,
                tokenPosition,
                ZERO_ADDRESS,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                adminFee,
                maxPlayersCount,
                curve.address,
                incentiveController.address,
                ZERO_ADDRESS,
                { from: admin },
            ),
            "invalid _gauge address");
        });

        it("reverts if the contract is deployed with invalid curve address", async () => {
            await truffleAssert.reverts(GoodGhostingPolygonCurve.new(
                token.address,
                pool.address,
                tokenPosition,
                tokenPosition,
                gauge.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                adminFee,
                maxPlayersCount,
                ZERO_ADDRESS,
                incentiveController.address,
                ZERO_ADDRESS,
                { from: admin },
            ),
            "invalid _curve address");
        });
    });

    describe("when an user tries to redeem from the external pool", async () => {

        it("transfer funds to contract then redeems from external pool", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            let contractMaticBalanceBeforeRedeem = await incentiveController.balanceOf(goodGhosting.address);
            let contractCurveBalanceBeforeRedeem = await curve.balanceOf(goodGhosting.address);

            await goodGhosting.redeemFromExternalPool({ from: player2 });
            let contractMaticBalanceAfterRedeem = await incentiveController.balanceOf(goodGhosting.address);
            let contractCurveBalanceAfterRedeem = await curve.balanceOf(goodGhosting.address);
            assert(contractMaticBalanceAfterRedeem.gt(contractMaticBalanceBeforeRedeem));
            assert(contractCurveBalanceAfterRedeem.gt(contractCurveBalanceBeforeRedeem));
        });

        it("emits event FundsRedeemedFromExternalPool when redeem is successful", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractCurveBalance = await curve.balanceOf(goodGhosting.address);
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => new BN(ev.curveRewards).eq(new BN(contractCurveBalance)),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });

        it("allocates external rewards sent to contract to the players", async () => {
            const incentiveRewards = new BN(toWad(1000));
            const contractMaticBalanceBeforeIncentive = await incentiveController.balanceOf(goodGhosting.address);
            await mintRewardsFor(goodGhosting.address);
            const contractMaticBalanceAfterIncentive = await incentiveController.balanceOf(goodGhosting.address);
            assert(
                contractMaticBalanceAfterIncentive.eq(incentiveRewards.add(contractMaticBalanceBeforeIncentive)),
                "contract rewards balance after incentive does not match"
            );

            await joinGamePaySegmentsAndComplete(player1);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            const rewardsPerPlayer = new BN (await goodGhosting.rewardsPerPlayer.call({ from: admin }));

            let contractMaticBalanceAfterRedeem = await incentiveController.balanceOf(goodGhosting.address);
            const contractDaiBalance = await token.balanceOf(goodGhosting.address);
            const expectedRewardAmount = contractMaticBalanceAfterRedeem.sub(contractMaticBalanceBeforeIncentive);

            assert(contractMaticBalanceAfterRedeem.gt(contractMaticBalanceAfterIncentive));
            assert(expectedRewardAmount.eq(rewardsPerPlayer), "rewardsPerPlayer does not match");
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => (
                    new BN(ev.totalAmount).eq(new BN(contractDaiBalance)) &&
                    new BN(ev.rewards).eq(new BN(expectedRewardAmount))
                ),
                "FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool",
            );
        });

        context("when incentive token is defined", async () => {
            const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            const incentiveAmount = new BN(toWad(10));
            let contract;
            let incentiveToken;

            beforeEach(async () => {
                incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                contract = await GoodGhostingPolygonCurve.new(
                    token.address,
                    pool.address,
                    tokenPosition,
                    tokenPosition,
                    gauge.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    adminFee,
                    maxPlayersCount,
                    curve.address,
                    incentiveController.address,
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
        it("transfers interest to the owner in case no one wins", async () => { // having test with only 1 player for now
            await joinGameMissLastPaymentAndComplete(player1);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            const adminBalance = await token.balanceOf(admin);
            const principalBalance = await token.balanceOf(goodGhosting.address);
            const matic = await incentiveController.balanceOf(goodGhosting.address)
            console.log('maticcc', matic.toString())
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => new BN(ev.totalGameInterest).eq(new BN(adminBalance)) && new BN(ev.totalGamePrincipal).eq(new BN(principalBalance)) && new BN(ev.rewards/10**18).eq(new BN(1000)),
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

        it("reverts if a non-player tries to withdraw", async () => {
            await approveDaiToContract(player1);
            await goodGhosting.joinGame( { from: player1 });
            await truffleAssert.reverts(goodGhosting.earlyWithdraw({ from: nonPlayer }), "Player does not exist");
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

            await token.approve(pool.address, ethers.utils.parseEther("1000"), { from: admin });
            await pool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true, { from: admin });
            await pool.transfer(goodGhosting.address, ethers.utils.parseEther("1000"), { from: admin });

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
            await token.approve(pool.address, ethers.utils.parseEther("1000"), { from: admin });
            await pool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true, { from: admin });
            await pool.transfer(goodGhosting.address, ethers.utils.parseEther("1000"), { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: admin });

            await goodGhosting.withdraw({ from: player1 });
            const player1PostWithdrawBalance = await token.balanceOf(player1);

            await goodGhosting.withdraw({ from: player2 });
            const player2PostWithdrawBalance = await token.balanceOf(player2);
            assert(player2PostWithdrawBalance.eq(player1PostWithdrawBalance));
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
            await token.approve(pool.address, ethers.utils.parseEther("1000"), { from: admin });
            await pool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true, { from: admin });
            await pool.transfer(goodGhosting.address, ethers.utils.parseEther("1000"), { from: admin });

            // Expect Player1 to get back the deposited amount
            const player1PreWithdrawBalance = await token.balanceOf(player1);
            let playerMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(player1);

            await goodGhosting.withdraw({ from: player1 });
            let playerMaticBalanceAfterWithdraw = await incentiveController.balanceOf(player1);
            assert(playerMaticBalanceAfterWithdraw.eq(playerMaticBalanceBeforeWithdraw));
            const player1PostWithdrawBalance = await token.balanceOf(player1);
            assert(player1PostWithdrawBalance.sub(player1PreWithdrawBalance).eq(segmentPayment));

            // Expect Player2 to get an amount greater than the sum of all the deposits
            const player2PreWithdrawBalance = await token.balanceOf(player2);
            playerMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(player2);

            await goodGhosting.withdraw({ from: player2 });
            playerMaticBalanceAfterWithdraw = await incentiveController.balanceOf(player2);
            assert(playerMaticBalanceAfterWithdraw.gt(playerMaticBalanceBeforeWithdraw));

            const player2PostWithdrawBalance = await token.balanceOf(player2);
            const totalGameInterest = await goodGhosting.totalGameInterest.call();
            const adminFeeAmount = (new BN(adminFee).mul(totalGameInterest)).div(new BN("100"));
            const withdrawalValue = player2PostWithdrawBalance.sub(player2PreWithdrawBalance);

            const userDeposit = segmentPayment.mul(web3.utils.toBN(segmentCount));
            // taking in account the pool fees 5%
            assert(withdrawalValue.lte(userDeposit.add(toWad(1000)).sub(adminFeeAmount)));
        });

        it("emits Withdrawal event when user withdraws", async () => { // having test with only 1 player for now
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: admin });
            const result = await goodGhosting.withdraw({ from: player1 });
            truffleAssert.eventEmitted(result, "Withdrawal", (ev) => {
                return ev.player === player1 && new BN(ev.playerReward/10**18).eq(new BN(1000));
            }, "unable to withdraw amount");
        });

        context("when incentive token is defined", async () => {
            const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            const incentiveAmount = new BN(toWad(10));
            const rewardAmount = new BN(toWad(1000));
            let contract;
            let incentiveToken;

            beforeEach(async () => {
                incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                contract = await GoodGhostingPolygonCurve.new(
                    token.address,
                    pool.address,
                    
                    tokenPosition,
                    tokenPosition,
                    gauge.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    0,
                    maxPlayersCount,
                    curve.address,
                    incentiveController.address,
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
                        new BN(ev.playerReward).eq(rewardAmount) &&
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
                        new BN(ev.playerReward).eq(rewardAmount) &&
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

            it("when admin tries to withdraw fees again", async () => {
                await joinGamePaySegmentsAndComplete(player1);
                //generating mock interest
                await mintTokensFor(admin);
                await token.approve(pool.address, ethers.utils.parseEther("1000"), { from: admin });
                await pool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true, { from: admin });
                await pool.transfer(goodGhosting.address, ethers.utils.parseEther("1000"), { from: admin });
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                await goodGhosting.adminFeeWithdraw({ from: admin });
                await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "Admin has already withdrawn");
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
                    (ev) => ev.totalGameInterest.eq(ZERO) && ev.adminFeeAmount.eq(ZERO)
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
                let adminMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(admin);

                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                let adminMaticBalanceAfterWithdraw = await incentiveController.balanceOf(admin);
                // no external deposits
                // the mock contract sends matic and curve rewards even if there is 1 deposit
                assert(adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw));
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee);
                    });
            });

            it("withdraw fees when there's only interest generated by external pool", async () => {
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);
                await goodGhosting.joinGame( { from: player1 });
                await goodGhosting.joinGame( { from: player2 });
                // mocks interest generation
                await mintTokensFor(admin);
                await token.approve(pool.address, ethers.utils.parseEther("1000"), { from: admin });
                await pool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true, { from: admin });
                await pool.transfer(goodGhosting.address, ethers.utils.parseEther("1000"), { from: admin });
                await advanceToEndOfGame();
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                const contractBalance = await token.balanceOf(goodGhosting.address);
                const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
                const grossInterest = contractBalance.sub(totalGamePrincipal);
                const regularAdminFee = grossInterest.mul(new BN(adminFee)).div(new BN(100));
                const gameInterest = await goodGhosting.totalGameInterest.call();
                // There's no winner, so admin takes it all
                const expectedAdminFee = regularAdminFee.add(gameInterest);
                let adminMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(admin);

                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                let adminMaticBalanceAfterWithdraw = await incentiveController.balanceOf(admin);
                assert(adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw));
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee);
                    });
            });

            it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
                await approveDaiToContract(player1);
                await approveDaiToContract(player2);
                await goodGhosting.joinGame( { from: player1 });
                await goodGhosting.joinGame( { from: player2 });
                await goodGhosting.earlyWithdraw({ from: player1 });
                await mintTokensFor(admin);
                await token.approve(pool.address, ethers.utils.parseEther("1000"), { from: admin });
                await pool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true, { from: admin });
                await pool.transfer(goodGhosting.address, ethers.utils.parseEther("1000"), { from: admin });
                await timeMachine.advanceTimeAndBlock(weekInSecs);
                await advanceToEndOfGame();
                await goodGhosting.redeemFromExternalPool({ from: player1 });
                const contractBalance = await token.balanceOf(goodGhosting.address);
                const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
                const grossInterest = contractBalance.sub(totalGamePrincipal);
                const regularAdminFee = grossInterest.mul(new BN(adminFee)).div(new BN(100));
                const gameInterest = await goodGhosting.totalGameInterest.call();
                // There's no winner, so admin takes it all
                const expectedAdminFee = regularAdminFee.add(gameInterest);
                const adminMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(admin);
                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                const adminMaticBalanceAfterWithdraw = await incentiveController.balanceOf(admin);
                assert(adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw));
                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => {
                        return ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee))
                        && ev.adminFeeAmount.eq(expectedAdminFee);
                    });
            });

            it("withdraw incentives sent to contract", async () => {
                const incentiveAmount = new BN(toWad(10));
                const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
                const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                const contract = await GoodGhostingPolygonCurve.new(
                    token.address,
                    pool.address,
                    
                    tokenPosition,
                    tokenPosition,
                    gauge.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    new BN(1),
                    maxPlayersCount,
                    curve.address,
                    incentiveController.address,
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
                    (ev) => ev.totalGameInterest.eq(ZERO) && ev.adminFeeAmount.eq(ZERO)
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
                        && ev.adminFeeAmount.eq(expectedAdminFee);
                    });
            });

            it("withdraw fees when there's only interest generated by external pool", async () => {
                await joinGamePaySegmentsAndComplete(player1);
                //generating mock interest
                await mintTokensFor(admin);
                await token.approve(pool.address, ethers.utils.parseEther("1000"), { from: admin });
                await pool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true, { from: admin });
                await pool.transfer(goodGhosting.address, ethers.utils.parseEther("1000"), { from: admin });
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
                        && ev.adminFeeAmount.eq(expectedAdminFee);
                    });
            });

            it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
                await approveDaiToContract(player2);
                await goodGhosting.joinGame( { from: player2 });
                await goodGhosting.earlyWithdraw({ from: player2 });

                await joinGamePaySegmentsAndComplete(player1);
                //generating mock interest
                await mintTokensFor(admin);
                await token.approve(pool.address, ethers.utils.parseEther("1000"), { from: admin });
                await pool.add_liquidity([ethers.utils.parseEther("1000"), "0", "0"], 0, true, { from: admin });
                await pool.transfer(goodGhosting.address, ethers.utils.parseEther("1000"), { from: admin });
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
                        && ev.adminFeeAmount.eq(expectedAdminFee);
                    });
            });

            it("does not withdraw any incentives sent to contract", async () => {
                const incentiveAmount = new BN(toWad(10));
                const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
                const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                const contract = await GoodGhostingPolygonCurve.new(
                    token.address,
                    pool.address,
                    
                    tokenPosition,
                    tokenPosition,
                    gauge.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    new BN(1),
                    maxPlayersCount,
                    curve.address,
                    incentiveController.address,
                    incentiveToken.address,
                    { from: admin },
                );

                await incentiveToken.mint(contract.address, incentiveAmount.toString(), { from: admin });
                await token.approve(contract.address, approvalAmount, { from: player1 });
                await joinGamePaySegmentsAndComplete(player1, contract);
                await advanceToEndOfGame();
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
        it("does not revert when there is no interest generated", async () => {
            goodGhosting = await GoodGhostingPolygonCurve.new(
                token.address,
                pool.address,
                
                tokenPosition,
                tokenPosition,
                gauge.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                0,
                maxPlayersCount,
                curve.address,
                incentiveController.address,
                ZERO_ADDRESS,
                { from: admin },
            );
            await joinGamePaySegmentsAndComplete(player1);
            //generating mock interest
            await mintTokensFor(goodGhosting.address);
            await mintTokensFor(admin);
            // await token.approve(pap.address, toWad(1000), { from: admin });
            // await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            const contractBalance = await token.balanceOf(goodGhosting.address);
            const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call();
            const grossInterest = contractBalance.sub(totalGamePrincipal);
            const ZERO = new BN(0);
            const result = await goodGhosting.adminFeeWithdraw({ from: admin });
            truffleAssert.eventEmitted(
                result,
                "AdminWithdrawal",
                (ev) => ev.totalGameInterest.eq(grossInterest) && ev.adminFeeAmount.eq(ZERO)
            );
        });

        it("withdraw incentives sent to contract", async () => {
            const incentiveAmount = new BN(toWad(10));
            const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
            const contract = await GoodGhostingPolygonCurve.new(
                token.address,
                pool.address,
                
                tokenPosition,
                tokenPosition,
                gauge.address,
                segmentCount,
                segmentLength,
                segmentPayment,
                fee,
                0,
                maxPlayersCount,
                curve.address,
                incentiveController.address,
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
});
