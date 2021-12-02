/* global context */
const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("MockERC20Mintable");
const GoodGhostingPolygon = artifacts.require("GoodGhostingPolygon");
const IncentiveControllerMock = artifacts.require("IncentiveControllerMock");

const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

contract("GoodGhostingPolygon", (accounts) => {
    // Only executes this test file IF NOT a local network fork
    if (["local-mainnet-fork", "local-celo-fork", "local-polygon-vigil-fork",  "local-polygon-vigil-fork-curve", "local-polygon-whitelisted-vigil-fork", "local-polygon-whitelisted-vigil-fork-curve"].includes(process.env.NETWORK)) return;

    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let aToken;
    let goodGhosting;
    let pap;
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

        goodGhosting = await GoodGhostingPolygon.new(
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
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "_earlyWithdrawalFee must be greater than zero");
        });

        it("reverts if the contract is deployed with early withdraw fee more than 10%", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "_earlyWithdrawalFee must be less than or equal to 10%");
        });

        it("reverts if the contract is deployed with admin fee more than 20%", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "_customFee must be less than or equal to 20%");
        });

        it("reverts if the contract is deployed with max player count equal to zero", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(
                GoodGhostingPolygon.new(
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
                    { from: admin },
                ),
                "_maxPlayersCount must be greater than zero"
            );
        });

        it("reverts if the contract is deployed with invalid inbound token address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "invalid _inboundCurrency address");
        });

        it("reverts if the contract is deployed with invalid lending pool address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "invalid _lendingPoolAddressProvider address");
        });

        it("reverts if the contract is deployed with segment count as 0", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "_segmentCount must be greater than zero");
        });

        it("reverts if the contract is deployed with segment length as 0", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "_segmentLength must be greater than zero");
        });

        it("reverts if the contract is deployed with segment payment as 0", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "_segmentPayment must be greater than zero");
        });

        it("reverts if the contract is deployed with invalid data provider address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "invalid _dataProvider address");
        });

        it("reverts if the contract is deployed with invalid incentive controller address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "invalid _incentiveController address");
        });

        it("reverts if the contract is deployed with invalid matic token address", async () => {
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            await truffleAssert.reverts(GoodGhostingPolygon.new(
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
                { from: admin },
            ),
            "invalid _matic address");
        });

        it("accepts setting type(uint256).max as the max number of players", async () => {
            const expectedValue = new BN(2).pow(new BN(256)).sub(new BN(1));
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            const contract = await GoodGhostingPolygon.new(
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
            const incentiveControllerResult = await goodGhosting.incentiveController.call();

            const lastSegmentResult = await goodGhosting.lastSegment.call();
            const segmentLengthResult = await goodGhosting.segmentLength.call();
            const segmentPaymentResult = await goodGhosting.segmentPayment.call();
            const maxPlayersCountResult = await goodGhosting.maxPlayersCount.call();
            const incentiveToken = await goodGhosting.incentiveToken.call();

            assert(incentiveControllerResult === incentiveController.address, `Incentive Controller address doesn't match. expected ${incentiveController.address}; got ${incentiveControllerResult}`);
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
    });

    describe("when an user tries to redeem from the external pool", async () => {
        it("reverts if funds were already redeemed", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            await goodGhosting.redeemFromExternalPool({ from: player1 });
            await truffleAssert.reverts(goodGhosting.redeemFromExternalPool({ from: player1 }), "Redeem operation already happened for the game");
        });

        it("allows to redeem from external pool when game is completed", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            truffleAssert.passes(goodGhosting.redeemFromExternalPool, "Couldn't redeem from external pool");
        });

        it("transfer funds to contract then redeems from external pool", async () => {
            const expectedBalance = web3.utils.toBN(segmentPayment * segmentCount);
            await joinGamePaySegmentsAndComplete(player1);
            let contractMaticBalanceBeforeRedeem = await incentiveController.balanceOf(goodGhosting.address);
            await goodGhosting.redeemFromExternalPool({ from: player2 });
            let contractMaticBalanceAfterRedeem = await incentiveController.balanceOf(goodGhosting.address);
            assert(contractMaticBalanceAfterRedeem.gt(contractMaticBalanceBeforeRedeem));
            const contractsDaiBalance = await token.balanceOf(goodGhosting.address);
            // No interest is generated during tests so far, so contract balance must equals the amount deposited.
            assert(expectedBalance.eq(contractsDaiBalance));
        });

        it("emits event FundsRedeemedFromExternalPool when redeem is successful", async () => {
            await joinGamePaySegmentsAndComplete(player1);
            let contractMaticBalanceBeforeRedeem = await incentiveController.balanceOf(goodGhosting.address);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            let contractMaticBalanceAfterRedeem = await incentiveController.balanceOf(goodGhosting.address);
            assert(contractMaticBalanceAfterRedeem.gt(contractMaticBalanceBeforeRedeem));
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
            let contractMaticBalanceBeforeRedeem = await incentiveController.balanceOf(goodGhosting.address);
            const result = await goodGhosting.redeemFromExternalPool({ from: player1 });
            let contractMaticBalanceAfterRedeem = await incentiveController.balanceOf(goodGhosting.address);
            assert(contractMaticBalanceAfterRedeem.gt(contractMaticBalanceBeforeRedeem));
            truffleAssert.eventEmitted(result, "WinnersAnnouncement", (ev) => {
                return ev.winners[0] === player1;
            }, "WinnersAnnouncement event should be emitted when funds are redeemed from external pool");
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
                pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
                aToken = await IERC20.at(await pap.getLendingPool.call());
                await pap.setUnderlyingAssetAddress(token.address);
                contract = await GoodGhostingPolygon.new(
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
                    incentiveController.address,
                    incentiveController.address,
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
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => new BN(ev.totalGameInterest).eq(new BN(adminBalance)) && new BN(ev.totalGamePrincipal).eq(new BN(principalBalance)) && new BN(ev.rewards/10**18).eq(new BN(1)),
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
                return ev.player === player1 && new BN(ev.playerReward/10**18).eq(new BN(1));
            }, "unable to withdraw amount");
        });

        context("when incentive token is defined", async () => {
            const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            const incentiveAmount = new BN(toWad(10));
            const rewardAmount = new BN(toWad(1));
            let contract;
            let incentiveToken;

            beforeEach(async () => {
                incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
                aToken = await IERC20.at(await pap.getLendingPool.call());
                await pap.setUnderlyingAssetAddress(token.address);
                contract = await GoodGhostingPolygon.new(
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
                    incentiveController.address,
                    incentiveController.address,
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
                await token.approve(pap.address, toWad(1000), { from: admin });
                await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
                await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
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
                assert(adminMaticBalanceAfterWithdraw.eq(adminMaticBalanceBeforeWithdraw));
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
                await token.approve(pap.address, toWad(1000), { from: admin });
                await pap.deposit(token.address, toWad(1000), pap.address, 0, { from: admin });
                await aToken.transfer(goodGhosting.address, toWad(1000), { from: admin });
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
                pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
                aToken = await IERC20.at(await pap.getLendingPool.call());
                await pap.setUnderlyingAssetAddress(token.address);
                const contract = await GoodGhostingPolygon.new(
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
                    incentiveController.address,
                    incentiveController.address,
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
                        && ev.adminFeeAmount.eq(expectedAdminFee);
                    });
            });

            it("does not withdraw any incentives sent to contract", async () => {
                const incentiveAmount = new BN(toWad(10));
                const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
                const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
                aToken = await IERC20.at(await pap.getLendingPool.call());
                await pap.setUnderlyingAssetAddress(token.address);
                const contract = await GoodGhostingPolygon.new(
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
                    incentiveController.address,
                    incentiveController.address,
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
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            await pap.setUnderlyingAssetAddress(token.address);
            goodGhosting = await GoodGhostingPolygon.new(
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
                incentiveController.address,
                incentiveController.address,
                { from: admin },
            );
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
                (ev) => ev.totalGameInterest.eq(grossInterest) && ev.adminFeeAmount.eq(ZERO)
            );
        });

        it("withdraw incentives sent to contract", async () => {
            const incentiveAmount = new BN(toWad(10));
            const approvalAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
            pap = await LendingPoolAddressesProviderMock.new("TOKEN_NAME", "TOKEN_SYMBOL", { from: admin });
            aToken = await IERC20.at(await pap.getLendingPool.call());
            await pap.setUnderlyingAssetAddress(token.address);
            const contract = await GoodGhostingPolygon.new(
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
                incentiveController.address,
                incentiveController.address,
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
