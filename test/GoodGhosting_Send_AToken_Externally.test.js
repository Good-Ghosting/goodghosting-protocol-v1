const GoodGhosting = artifacts.require("GoodGhosting");
const GoodGhostingPolygon = artifacts.require("GoodGhostingPolygon");
const ForceSend = artifacts.require("ForceSend");
const ATokenWrapper = artifacts.require("ATokenWrapper");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const daiABI = require("../abi-external/dai-abi.json");
const aTokenArtifact = require("@aave/protocol-v2/artifacts/contracts/protocol/tokenization/AToken.sol/AToken.json");
const configs = require("../deploy.config");

contract("GoodGhosting_Send_AToken_Externally", (accounts) => {

    // Only executes this test file for local network fork
    if (!["local-mainnet-fork", "local-polygon-vigil-fork"].includes(process.env.NETWORK)) return;

    global.web3 = web3;
    const unlockedDaiAccount = process.env.DAI_ACCOUNT_HOLDER_FORKED_NETWORK;
    let providersConfigs;
    let GoodGhostingArtifact;
    let aTokenAddress;
    if (process.env.NETWORK === "local-mainnet-fork") {
        GoodGhostingArtifact = GoodGhosting;
        providersConfigs     = configs.providers.aave.mainnet;
        aTokenAddress = "0x028171bCA77440897B824Ca71D1c56caC55b68A3";
    } else {
        GoodGhostingArtifact = GoodGhostingPolygon;
        providersConfigs     = configs.providers.aave.polygon;
        aTokenAddress = "0x27F8D03b3a2196956ED754baDc28D73be8830A6e";
    }

    const { segmentCount, segmentLength, segmentPayment: segmentPaymentInt, customFee } = configs.deployConfigs;
    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    let token;
    let rewardToken;
    let admin = accounts[0];
    const players = accounts.slice(1, 6); // 5 players
    const loser = players[0];
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(segmentPaymentInt)); // equivalent to 10 DAI
    let goodGhosting;
    const incentiveInterest = segmentPayment.mul(new BN(segmentCount));

    describe("simulates a full game with 5 players and 4 of them winning the game but considering an external adai transfer from admin", async () => {
        it("initializes contract instances and transfers DAI to players", async () => {
            token = new web3.eth.Contract(daiABI, providersConfigs.dai.address);
            rewardToken = new web3.eth.Contract(daiABI, providersConfigs.wmatic);
            goodGhosting = await GoodGhostingArtifact.deployed();
            // Send 1 eth to token address to have gas to transfer DAI.
            // Uses ForceSend contract, otherwise just sending a normal tx will revert.
            const forceSend = await ForceSend.new();
            await forceSend.go(token.options.address, { value: web3.utils.toWei("1", "Ether"), from: admin });

            const interestBearingToken = new web3.eth.Contract(aTokenArtifact.abi, aTokenAddress);
            const aTokenWrapper = await ATokenWrapper.at(aTokenAddress);
            const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
            const aDaiUnlockedBalance = await interestBearingToken.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
            const aDaiUnlockedBalanceOnWrapper = await aTokenWrapper.balanceOf(unlockedDaiAccount, { from: admin });
            const aDaiTotalSupply = await interestBearingToken.methods.totalSupply().call({ from: admin });
            const daiAmount = segmentPayment.mul(new BN(segmentCount)).toString();

            console.log("unlockedBalance: ", web3.utils.fromWei(unlockedBalance));
            console.log("aDaiUnlockedBalance: ", web3.utils.fromWei(aDaiUnlockedBalance));
            console.log("aDaiUnlockedBalanceOnWrapper: ", web3.utils.fromWei(aDaiUnlockedBalanceOnWrapper));
            console.log("aDaiTotalSupply: ", web3.utils.fromWei(aDaiTotalSupply));
            console.log("daiAmountToTransfer", web3.utils.fromWei(daiAmount));
            console.log("incentiveInterest", web3.utils.fromWei(incentiveInterest));

            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                await token.methods
                    .transfer(player, daiAmount)
                    .send({ from: unlockedDaiAccount });
                const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
                console.log(`player${i+1}DAIBalance`, web3.utils.fromWei(playerBalance));
            }

            const beforeBalance = await aTokenWrapper.balanceOf(goodGhosting.address, { from: unlockedDaiAccount });
            assert(beforeBalance.eq(new BN(0)));
            console.log("beforeBalance", beforeBalance.toString());
            await aTokenWrapper
                .transfer(goodGhosting.address, incentiveInterest, { from: unlockedDaiAccount });
            const afterBalance = await aTokenWrapper.balanceOf(goodGhosting.address, { from: unlockedDaiAccount });
            console.log("afterBalance", web3.utils.fromWei(afterBalance.toString()));
            assert(afterBalance.eq(new BN(incentiveInterest)));
        });

        it("checks if the contract's variables were properly initialized", async () => {
            const inboundCurrencyResult = await goodGhosting.daiToken.call();
            const lendingPoolAddressProviderResult = await goodGhosting.lendingPoolAddressProvider.call();
            const lastSegmentResult = await goodGhosting.lastSegment.call();
            const segmentLengthResult = await goodGhosting.segmentLength.call();
            const segmentPaymentResult = await goodGhosting.segmentPayment.call();
            const expectedSegment = new BN(0);
            const currentSegmentResult = await goodGhosting.getCurrentSegment.call({ from: admin });
            assert(inboundCurrencyResult === token.options.address, `Inbound currency doesn't match. expected ${token.options.address}; got ${inboundCurrencyResult}`);
            assert(lendingPoolAddressProviderResult === providersConfigs.lendingPoolAddressProvider, `LendingPoolAddressesProvider doesn't match. expected ${providersConfigs.dataProvider}; got ${lendingPoolAddressProviderResult}`);
            assert(new BN(lastSegmentResult).eq(new BN(segmentCount)), `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`);
            assert(new BN(segmentLengthResult).eq(new BN(segmentLength)), `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`);
            assert(new BN(segmentPaymentResult).eq(new BN(segmentPayment)), `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`);
            assert(currentSegmentResult.eq(new BN(0)), `should start at segment ${expectedSegment} but started at ${currentSegmentResult.toNumber()} instead.`);
        });

        it("players approve DAI to contract and join the game", async () => {
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                await token.methods
                    .approve(goodGhosting.address, segmentPayment.mul(new BN(segmentCount)).toString())
                    .send({ from: player });
                        const result = await goodGhosting.joinGame({ from: player });
                        let playerEvent = "";
                        let paymentEvent = 0;
                        truffleAssert.eventEmitted(
                            result,
                            "JoinedGame",
                            (ev) => {
                                playerEvent = ev.player;
                                paymentEvent = ev.amount;
                                return playerEvent === player && new BN(paymentEvent).eq(new BN(segmentPayment));
                            },
                            `JoinedGame event should be emitted when an user joins the game with params\n
                            player: expected ${player}; got ${playerEvent}\n
                            paymentAmount: expected ${segmentPayment}; got ${paymentEvent}`,
                        );
            }
        });

        it("runs the game - 'player1' early withdraws and other players complete game successfully", async () => {
            // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
            for (let segmentIndex = 1; segmentIndex < segmentCount; segmentIndex++) {
                await timeMachine.advanceTime(segmentLength);
                // Player 1 (index 0 - loser), performs an early withdraw on first segment.
                if (segmentIndex === 1) {
                    const earlyWithdrawResult = await goodGhosting.earlyWithdraw({ from: loser});
                    truffleAssert.eventEmitted(
                        earlyWithdrawResult,
                        "EarlyWithdrawal",
                        (ev) => ev.player === loser,
                        "loser unable to early withdraw from game",
                    );
                }

                // j must start at 1 - Player1 (index 0) early withdraw, so won't continue making deposits
                for (let j = 1; j < players.length - 1; j++) {
                    const player = players[j];
                    const depositResult = await goodGhosting.makeDeposit({ from: player });
                    truffleAssert.eventEmitted(
                        depositResult,
                        "Deposit",
                        (ev) => ev.player === player && ev.segment.toNumber() === segmentIndex,
                        `player ${j} unable to deposit for segment ${segmentIndex}`,
                    );
                }
            }
            // accounted for 1st deposit window
            // the loop will run till segmentCount - 1
            // after that funds for the last segment are deposited to protocol then we wait for segment length to deposit to the protocol
            // and another segment where the last segment deposit can generate yield
            await timeMachine.advanceTime(segmentLength);
            await timeMachine.advanceTime(segmentLength);
        });


        it("redeems funds from external pool", async () => {
            let eventTotalAmount = new BN(0);
            const result = await goodGhosting.redeemFromExternalPool({ from: admin });
            const contractsDaiBalance = new BN(await token.methods.balanceOf(goodGhosting.address).call({ from: admin }));

            console.log("contractsDaiBalance", contractsDaiBalance.toString());
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => {
                    eventTotalAmount = new BN(ev.totalAmount.toString());
                    const eventGamePrincipal = new BN(ev.totalGamePrincipal.toString());
                    const eventGameInterest = new BN(ev.totalGameInterest.toString());
                    const eventInterestPerPlayer = eventGameInterest.div(new BN(players.length - 1));
                    const expectedMinimumInterestPerPlayer = incentiveInterest.div(new BN(players.length - 1));

                    console.log(`totalContractAmount: ${web3.utils.fromWei(eventTotalAmount.toString())} | ${eventTotalAmount.toString()} wei`);
                    console.log(`totalGamePrincipal: ${web3.utils.fromWei(eventGamePrincipal.toString())} | ${eventGamePrincipal.toString()} wei`);
                    console.log(`totalGameInterest: ${web3.utils.fromWei(eventGameInterest.toString())} | ${eventGameInterest.toString()} wei`);
                    console.log(`incentiveInterest: ${web3.utils.fromWei(incentiveInterest.toString())} | ${incentiveInterest.toString()} wei`);
                    console.log(`interestPerPlayer: ${web3.utils.fromWei(eventInterestPerPlayer.toString())} | ${eventInterestPerPlayer.toString()} wei`);
                    console.log(`incentiveInterestPerPlayer: ${web3.utils.fromWei(expectedMinimumInterestPerPlayer.toString())} | ${expectedMinimumInterestPerPlayer.toString()} wei`);
                    const adminFee = (new BN(configs.deployConfigs.customFee).mul(ev.totalGameInterest).div(new BN('100')));
                    return (
                        // trimmed down the extra checks
                        eventTotalAmount.eq(contractsDaiBalance)
                        && eventTotalAmount.gte(eventGamePrincipal.add(eventGameInterest).add(adminFee))

                    );
                },
                `FundsRedeemedFromExternalPool error - event amount: ${eventTotalAmount.toString()}; expectAmount: ${contractsDaiBalance.toString()}`,
            );
        });

        it("players withdraw from contract", async () => {
            // starts from 1, since player1 (loser), requested an early withdraw
            for (let i = 1; i < players.length - 1; i++) {
                const player = players[i];
                const playerInfo = await goodGhosting.players(player, { from: player });

                let playerMaticBalanceBeforeWithdraw;
                if (GoodGhostingArtifact === GoodGhostingPolygon) {
                    playerMaticBalanceBeforeWithdraw = new BN(await rewardToken.methods.balanceOf(player).call({ from: admin }));
                }
                const result = await goodGhosting.withdraw({ from: player });
                truffleAssert.eventEmitted(result, "Withdrawal", async (ev) => {
                    console.log(`player${i} withdraw amount: ${ev.amount.toString()}`);
                    if (GoodGhostingArtifact === GoodGhostingPolygon) {
                        const playersMaticBalance = new BN(await rewardToken.methods.balanceOf(player).call({ from: admin }));
                        return ev.player === player && new BN(ev.amount.toString()).gt(playerInfo.amountPaid) && playersMaticBalance.gt(playerMaticBalanceBeforeWithdraw);
                    } else {
                        return ev.player === player && new BN(ev.amount.toString()).gt(playerInfo.amountPaid);
                    }
                }, "unable to withdraw amount");
            }
        });

        it("admin withdraws admin fee from the contract", async () => {
            if (!customFee) {
                await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "No Fees Earned");
            } else {
                let adminMaticBalanceBeforeWithdraw;
                if (GoodGhostingArtifact === GoodGhostingPolygon) {
                    adminMaticBalanceBeforeWithdraw = new BN(await rewardToken.methods.balanceOf(admin).call({ from: admin }));
                }
                const result = await goodGhosting.adminFeeWithdraw({ from: admin });
                if (GoodGhostingArtifact === GoodGhostingPolygon) {
                    const adminMaticBalance = new BN(await rewardToken.methods.balanceOf(admin).call({ from: admin }));
                    truffleAssert.eventEmitted(
                        result,
                        "AdminWithdrawal",
                        (ev) => {
                            const adminFee = (new BN(configs.deployConfigs.customFee).mul(ev.totalGameInterest).div(new BN('100')));
                                return adminFee.lte(ev.adminFeeAmount) && adminMaticBalance.eq(adminMaticBalanceBeforeWithdraw);
                        });
                } else {
                    truffleAssert.eventEmitted(
                        result,
                        "AdminWithdrawal",
                        (ev) => {
                            const adminFee = (new BN(configs.deployConfigs.customFee).mul(ev.totalGameInterest).div(new BN('100')));
                                return adminFee.lte(ev.adminFeeAmount);
                        });
                }

                await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "Admin has already withdrawn");
            }
        });
    });
});
