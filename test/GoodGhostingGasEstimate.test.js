const GoodGhosting = artifacts.require("GoodGhosting");
const GoodGhostingPolygon = artifacts.require("GoodGhostingPolygon");
const GoodGhostingPolygonWhitelisted = artifacts.require(
    "GoodGhostingPolygonWhitelisted"
);
const GoodGhostingPolygonCurve = artifacts.require("GoodGhostingPolygonCurve");
const ForceSend = artifacts.require("ForceSend");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const daiABI = require("../abi-external/dai-abi.json");
const poolABI = require("../abi-external/curve-pool-abi.json");
const configs = require("../deploy.config");
const { isBN } = require("bn.js");
const whitelistedPlayerConfig = [
    { "0x49456a22bbED4Ae63d2Ec45085c139E6E1879A17": { index: 0, proof: ["0x8d49a056cfc62406d6824845a614366d64cc27684441621ef0e019def6e41398", "0x73ffb6e5b1b673c6c13ec44ce753aa553a9e4dea224b10da5068ade50ce74de3"] } },
    { "0x4e7F88e38A05fFed54E0bE6d614C48138cE605Cf": { index: 1, proof: ["0xefc82954f8d1549053814986f191e870bb8e2b4efae54964a8831ddd1eaf6267", "0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef"] } },
    { "0x78863CB2db754Fc45030c4c25faAf757188A0784": { index: 2, proof: ["0x6ecff5307e97b4034a59a6888301eaf1e5fdcc399163a89f6e886d1ed4a6614f", "0x73ffb6e5b1b673c6c13ec44ce753aa553a9e4dea224b10da5068ade50ce74de3"] } },
    { "0xd1E80094e0f5f00225Ea5D962484695d57f3afaA": { index: 3, proof: ["0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324", "0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef"] } },
    // invalid user
    { "0x7C3E8511863daF709bdBe243356f562e227573d4": { index: 3, proof: ["0x45533c7da4a9f550fb2a9e5efe3b6db62261670807ed02ce75cb871415d708cc", "0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef", "0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"] } }
];

contract("GoodGhostingGasEstimate", (accounts) => {
    // Only executes this test file for local network fork
    if (
        ![
            "local-mainnet-fork",
            "local-polygon-vigil-fork",
            "local-polygon-whitelisted-vigil-fork",
            "local-celo-fork",
            "local-polygon-vigil-fork-curve"
        ].includes(process.env.NETWORK)
    )
        return;

    global.web3 = web3;
    const unlockedDaiAccount = process.env.DAI_ACCOUNT_HOLDER_FORKED_NETWORK;
    let providersConfigs;
    let GoodGhostingArtifact;
    let curve;
    if (process.env.NETWORK === "local-mainnet-fork" || process.env.NETWORK === "local-celo-fork") {
        GoodGhostingArtifact = GoodGhosting;
        if (process.env.NETWORK === "local-mainnet-fork") {
            providersConfigs = configs.providers.aave.mainnet;
        } else if (process.env.NETWORK === "local-celo-fork") {
            providersConfigs = configs.providers.aave.celo;
        }
    } else if (process.env.NETWORK === "local-polygon-vigil-fork") {
        GoodGhostingArtifact = GoodGhostingPolygon;
        providersConfigs = configs.providers.aave.polygon;
    } else if (process.env.NETWORK === "local-polygon-vigil-fork-curve") {
        GoodGhostingArtifact = GoodGhostingPolygonCurve;
        providersConfigs = configs.providers.aave["polygon-curve"];
        curve = new web3.eth.Contract(
            daiABI,
            providersConfigs.curve
        );
    } else {
        GoodGhostingArtifact = GoodGhostingPolygonWhitelisted;
        providersConfigs = configs.providers.aave.polygon;
    }
    const {
        segmentCount,
        segmentLength,
        segmentPayment: segmentPaymentInt,
        customFee,
        maxPlayersCount,
    } = configs.deployConfigs;
    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    let token;
    let rewardToken;
    let pool;
    let admin = accounts[0];
    const players = accounts.slice(1, 6); // 5 players
    const loser = players[0];
    const userWithdrawingAfterLastSegment = players[1];
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(segmentPaymentInt)); // equivalent to 10 DAI
    let goodGhosting;

    describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
        it("initializes contract instances and transfers DAI to players", async () => {
            pool = new web3.eth.Contract(poolABI, providersConfigs.pool)
            token = new web3.eth.Contract(daiABI, providersConfigs.dai.address);
            rewardToken = new web3.eth.Contract(
                daiABI,
                providersConfigs.wmatic
            );
            goodGhosting = await GoodGhostingArtifact.deployed();
            // Send 1 eth to token address to have gas to transfer DAI.
            // Uses ForceSend contract, otherwise just sending a normal tx will revert.
            const forceSend = await ForceSend.new();
            await forceSend.go(token.options.address, {
                value: web3.utils.toWei("1", "Ether"),
                from: admin,
            });
            const unlockedBalance = await token.methods
                .balanceOf(unlockedDaiAccount)
                .call({ from: admin });
            const daiAmount = segmentPayment
                .mul(new BN(segmentCount))
                .toString();
            console.log(
                "unlockedBalance: ",
                web3.utils.fromWei(unlockedBalance)
            );
            console.log("daiAmountToTransfer", web3.utils.fromWei(daiAmount));
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                let transferAmount = daiAmount;
                if (i === 1) {
                    // Player 1 needs additional funds to rejoin
                    transferAmount = new BN(daiAmount)
                        .add(segmentPayment)
                        .toString();
                }
                await token.methods
                    .transfer(player, transferAmount)
                    .send({ from: unlockedDaiAccount });
                const playerBalance = await token.methods
                    .balanceOf(player)
                    .call({ from: admin });
                console.log(
                    `player${i + 1}DAIBalance`,
                    web3.utils.fromWei(playerBalance)
                );
            }
        });

        it("checks if the contract's variables were properly initialized", async () => {
            const inboundCurrencyResult = await goodGhosting.daiToken.call();
            const lastSegmentResult = await goodGhosting.lastSegment.call();
            const segmentLengthResult = await goodGhosting.segmentLength.call();
            const segmentPaymentResult = await goodGhosting.segmentPayment.call();
            const expectedSegment = new BN(0);
            const currentSegmentResult = await goodGhosting.getCurrentSegment.call();
            const maxPlayersCountResult = await goodGhosting.maxPlayersCount.call();
            assert(
                inboundCurrencyResult === token.options.address,
                `Inbound currency doesn't match. expected ${token.options.address}; got ${inboundCurrencyResult}`
            );
            if (process.env.NETWORK !== "local-polygon-vigil-fork-curve") {
                const lendingPoolAddressProviderResult = await goodGhosting.lendingPoolAddressProvider.call();

                assert(
                    lendingPoolAddressProviderResult ===
                    providersConfigs.lendingPoolAddressProvider,
                    `LendingPoolAddressesProvider doesn't match. expected ${providersConfigs.dataProvider}; got ${lendingPoolAddressProviderResult}`
                );
            }

            assert(
                new BN(lastSegmentResult).eq(new BN(segmentCount)),
                `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`
            );
            assert(
                new BN(segmentLengthResult).eq(new BN(segmentLength)),
                `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`
            );
            assert(
                new BN(segmentPaymentResult).eq(new BN(segmentPayment)),
                `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`
            );
            assert(
                currentSegmentResult.eq(new BN(0)),
                `should start at segment ${expectedSegment} but started at ${currentSegmentResult.toNumber()} instead.`
            );
            assert(
                new BN(maxPlayersCountResult).eq(new BN(maxPlayersCount)),
                `MaxPlayersCount doesn't match. expected ${maxPlayersCount.toString()}; got ${maxPlayersCountResult}`
            );

        });

        it("players approve DAI to contract and join the game", async () => {
            const userSlippageOptions = [1, 0.5, 0.5, 2, 1]
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                await token.methods
                    .approve(
                        goodGhosting.address,
                        segmentPayment.mul(new BN(segmentCount)).toString()
                    )
                    .send({ from: player });
                let playerEvent = "";
                let paymentEvent = 0;
                if (
                    process.env.NETWORK === "local-mainnet-fork" ||
                    process.env.NETWORK === "local-celo-fork" ||
                    process.env.NETWORK === "local-polygon-vigil-fork" ||
                    process.env.NETWORK === "local-polygon-vigil-fork-curve"
                ) {
                    let result;

                    const userProvidedMinAmount = segmentPayment.sub(segmentPayment.mul(new BN(userSlippageOptions[i])).div(new BN(100)))
                    const slippageFromContract = await pool.methods.calc_token_amount([segmentPayment.toString(),0,0], true).call();

                    const minAmountWithFees = parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString()) ? new BN(slippageFromContract).sub(new BN(slippageFromContract).mul(new BN('10')).div(new BN("10000"))) : userProvidedMinAmount.sub(userProvidedMinAmount.mul(new BN('10')).div(new BN('10000')))

                    if (process.env.NETWORK === "local-polygon-vigil-fork-curve") {
                        result = await goodGhosting.joinGame(minAmountWithFees.toString(), { from: player });
                    } else {
                        result = await goodGhosting.joinGame({ from: player });
                    }
 
                    // player 1 early withdraws in segment 0 and joins again
                    if (i == 1) {
                        await goodGhosting.earlyWithdraw({ from: player });
                        await token.methods
                            .approve(
                                goodGhosting.address,
                                segmentPayment
                                    .mul(new BN(segmentCount))
                                    .toString()
                            )
                            .send({ from: player });

                        if (process.env.NETWORK === "local-polygon-vigil-fork-curve") {
                                await goodGhosting.joinGame(minAmountWithFees.toString(), { from: player });
                        } else {
                                await goodGhosting.joinGame({ from: player });
                        }
                    }
                    // got logs not defined error when keep the event assertion check outside of the if-else
                    truffleAssert.eventEmitted(
                        result,
                        "JoinedGame",
                        (ev) => {
                            playerEvent = ev.player;
                            paymentEvent = ev.amount;
                            return (
                                playerEvent === player &&
                                new BN(paymentEvent).eq(new BN(segmentPayment))
                            );
                        },
                        `JoinedGame event should be emitted when an user joins the game with params\n
                            player: expected ${player}; got ${playerEvent}\n
                            paymentAmount: expected ${segmentPayment}; got ${paymentEvent}`
                    );
                } else {
                    if (i === players.length - 1) {
                        await truffleAssert.reverts(
                            goodGhosting.joinWhitelistedGame(
                                whitelistedPlayerConfig[i][player].index,
                                whitelistedPlayerConfig[i][player].proof,
                                { from: player }
                            ),
                            "MerkleDistributor: Invalid proof."
                        );
                    } else {
                        const result = await goodGhosting.joinWhitelistedGame(
                            whitelistedPlayerConfig[i][player].index,
                            whitelistedPlayerConfig[i][player].proof,
                            { from: player }
                        );
                        // player 1 early withdraws in segment 0 and joins again
                        if (i == 1) {
                            await goodGhosting.earlyWithdraw({ from: player });
                            await token.methods
                                .approve(
                                    goodGhosting.address,
                                    segmentPayment
                                        .mul(new BN(segmentCount))
                                        .toString()
                                )
                                .send({ from: player });
                            await goodGhosting.joinWhitelistedGame(
                                whitelistedPlayerConfig[i][player].index,
                                whitelistedPlayerConfig[i][player].proof,
                                { from: player }
                            );
                        }
                        // got logs not defined error when keep the event assertion check outside of the if-else
                        truffleAssert.eventEmitted(
                            result,
                            "JoinedGame",
                            (ev) => {
                                playerEvent = ev.player;
                                paymentEvent = ev.amount;
                                return (
                                    playerEvent === player &&
                                    new BN(paymentEvent).eq(new BN(segmentPayment))
                                );
                            },
                            `JoinedGame event should be emitted when an user joins the game with params\n
                                player: expected ${player}; got ${playerEvent}\n
                                paymentAmount: expected ${segmentPayment}; got ${paymentEvent}`
                        );
                    }
                }
            }
        });

        it("runs the game - 'player1' early withdraws and other players complete game successfully", async () => {
            const userSlippageOptions = [3, 5, 1, 2.5, 1.5]

            // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
            for (
                let segmentIndex = 1;
                segmentIndex < segmentCount;
                segmentIndex++
            ) {
                await timeMachine.advanceTime(segmentLength);
                // j must start at 1 - Player1 (index 0) early withdraws after everyone else deposits, so won't continue making deposits
                for (let j = 1; j < players.length - 1; j++) {
                    const player = players[j];
                    let depositResult;
                    const userProvidedMinAmount = segmentPayment.sub(segmentPayment.mul(new BN(userSlippageOptions[j])).div(new BN(100)))
                    const slippageFromContract = await pool.methods.calc_token_amount([segmentPayment.toString(),0,0], true).call();

                    const minAmountWithFees = parseInt(userProvidedMinAmount.toString()) > parseInt(slippageFromContract.toString()) ? new BN(slippageFromContract).sub(new BN(slippageFromContract).mul(new BN('10')).div(new BN("10000"))) : userProvidedMinAmount.sub(userProvidedMinAmount.mul(new BN('10')).div(new BN('10000')))
                    if (process.env.NETWORK === "local-polygon-vigil-fork-curve") {

                        depositResult = await goodGhosting.makeDeposit(minAmountWithFees.toString(), {from: player});                    
                    } else {
                        depositResult = await goodGhosting.makeDeposit({from: player});                    
                    }

                    truffleAssert.eventEmitted(
                        depositResult,
                        "Deposit",
                        (ev) =>
                            ev.player === player &&
                            ev.segment.toNumber() === segmentIndex,
                        `player ${j} unable to deposit for segment ${segmentIndex}`
                    );
                }

                // Player 1 (index 0 - loser), performs an early withdraw on first segment.
                if (segmentIndex === 1) {
                    const earlyWithdrawResult = await goodGhosting.earlyWithdraw(
                        { from: loser }
                    );
                    truffleAssert.eventEmitted(
                        earlyWithdrawResult,
                        "EarlyWithdrawal",
                        (ev) => ev.player === loser,
                        "loser unable to early withdraw from game"
                    );
                }
            }
            // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
            // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
            const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount() 
            await goodGhosting.earlyWithdraw({ from: userWithdrawingAfterLastSegment });
            const winnerCountaAfterEarlyWithdraw = await goodGhosting.winnerCount()

            assert(winnerCountBeforeEarlyWithdraw.eq(new BN(3)))
            assert(winnerCountaAfterEarlyWithdraw.eq(new BN(2)))
            await timeMachine.advanceTime(segmentLength * 2);
        });

        it("redeems funds from external pool", async () => {
            let curveBalanceBeforeRedeem, wmaticBalanceBeforeRedeem, curveBalanceAfterRedeem, wmaticBalanceAfterRedeem;
            if (process.env.NETWORK === "local-polygon-vigil-fork-curve") {    
                curveBalanceBeforeRedeem = await curve.methods.balanceOf(goodGhosting.address).call()
                wmaticBalanceBeforeRedeem = await rewardToken.methods.balanceOf(goodGhosting.address).call()
            }

            let eventAmount = new BN(0);
            const result = await goodGhosting.redeemFromExternalPool({
                from: admin,
            });
            if (process.env.NETWORK === "local-polygon-vigil-fork-curve") {
                curveBalanceAfterRedeem = await curve.methods.balanceOf(goodGhosting.address).call()
                wmaticBalanceAfterRedeem = await rewardToken.methods.balanceOf(goodGhosting.address).call()
                // curve rewards accure slowly
                assert(new BN(curveBalanceBeforeRedeem).lte(new BN(curveBalanceAfterRedeem)))
                assert(new BN(wmaticBalanceBeforeRedeem).lt(new BN(wmaticBalanceAfterRedeem)))
            }

            const contractsDaiBalance = new BN(
                await token.methods
                    .balanceOf(goodGhosting.address)
                    .call({ from: admin })
            );
            console.log("contractsDaiBalance", contractsDaiBalance.toString());
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => {
                    console.log(
                        "totalContractAmount",
                        ev.totalAmount.toString()
                    );
                    console.log(
                        "totalGamePrincipal",
                        ev.totalGamePrincipal.toString()
                    );
                    console.log(
                        "totalGameInterest",
                        ev.totalGameInterest.toString()
                    );
                    console.log(
                        "interestPerPlayer",
                        ev.totalGameInterest
                            .div(new BN(players.length - 1))
                            .toString()
                    );
                    const adminFee = new BN(configs.deployConfigs.customFee)
                        .mul(ev.totalGameInterest)
                        .div(new BN("100"));
                    eventAmount = new BN(ev.totalAmount.toString());

                    return (
                        eventAmount.eq(contractsDaiBalance) &&
                        adminFee.lt(ev.totalGameInterest)
                    );
                },
                `FundsRedeemedFromExternalPool error - event amount: ${eventAmount.toString()}; expectAmount: ${contractsDaiBalance.toString()}`
            );
        });

        it("players withdraw from contract", async () => {
            // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
            for (let i = 2; i < players.length - 1; i++) {
                const player = players[i];
                let rewardBalanceBefore = new BN(0);
                let rewardBalanceAfter = new BN(0);
                let curveRewardBalanceBefore = new BN(0);
                let curveRewardBalanceAfter = new BN(0);

                if (
                    GoodGhostingArtifact === GoodGhostingPolygon
                    || GoodGhostingArtifact === GoodGhostingPolygonWhitelisted || GoodGhostingArtifact === GoodGhostingPolygonCurve
                ) {
                    rewardBalanceBefore = new BN(
                        await rewardToken.methods
                            .balanceOf(player)
                            .call({ from: admin })
                    );
                }

                if (GoodGhostingArtifact === GoodGhostingPolygonCurve) {
                    curveRewardBalanceBefore = new BN(
                        await curve.methods
                            .balanceOf(player)
                            .call({ from: admin })
                    );
                }
                const result = await goodGhosting.withdraw({ from: player });

                if (GoodGhostingArtifact === GoodGhostingPolygonCurve) {
                    curveRewardBalanceAfter = new BN(
                        await curve.methods
                            .balanceOf(player)
                            .call({ from: admin })
                    );
                    // curve rewards accure slowly
                    assert(
                        curveRewardBalanceAfter.gte(curveRewardBalanceBefore),
                        "expected curve balance after withdrawal to be greater than before withdrawal"
                    );
                }
                if (
                    GoodGhostingArtifact === GoodGhostingPolygon
                    || GoodGhostingArtifact === GoodGhostingPolygonWhitelisted
                ) {
                    rewardBalanceAfter = new BN(
                        await rewardToken.methods
                            .balanceOf(player)
                            .call({ from: admin })
                    );

                    assert(
                        rewardBalanceAfter.gt(rewardBalanceBefore),
                        "expected rewards balance after withdrawal to be greater than before withdrawal"
                    );
                } else {
                    assert(
                        rewardBalanceAfter.eq(rewardBalanceBefore),
                        "expected rewards balance after withdrawal to be equal to before withdrawal"
                    );
                }

                truffleAssert.eventEmitted(
                    result,
                    "Withdrawal",
                    async (ev) => {
                        console.log(
                            `player${i} withdraw amount: ${ev.amount.toString()}`
                        );
                        if (
                            GoodGhostingArtifact === GoodGhostingPolygon ||
                            GoodGhostingArtifact === GoodGhostingPolygonWhitelisted
                        ) {
                            return (
                                ev.player === player &&
                                new BN(ev.playerReward).eq(
                                    rewardBalanceAfter.sub(rewardBalanceBefore)
                                )
                            );
                        } else {
                            return (
                                ev.player === player &&
                                new BN(ev.playerReward).eq(new BN(0))
                            );
                        }
                    },
                    "withdrawal event failure"
                );
            }
        });

        it("admin withdraws admin fee from contract", async () => {
          if (customFee > 0) {
                const expectedAmount = new BN(
                    await goodGhosting.adminFeeAmount.call({ from: admin })
                );

                let rewardBalanceBefore = new BN(0);
                let rewardBalanceAfter = new BN(0);
                let curveRewardBalanceBefore = new BN(0);
                let curveRewardBalanceAfter = new BN(0);

                if (GoodGhostingArtifact === GoodGhostingPolygonCurve) {
                    curveRewardBalanceBefore = new BN(
                        await curve.methods
                            .balanceOf(admin)
                            .call({ from: admin })
                    );
                }

                if (
                    GoodGhostingArtifact === GoodGhostingPolygon
                    || GoodGhostingArtifact === GoodGhostingPolygonWhitelisted || GoodGhostingArtifact === GoodGhostingPolygonCurve
                ) {
                    rewardBalanceBefore = new BN(
                        await rewardToken.methods
                            .balanceOf(admin)
                            .call({ from: admin })
                    );
                }

                const result = await goodGhosting.adminFeeWithdraw({
                    from: admin,
                });

                if (GoodGhostingArtifact === GoodGhostingPolygonCurve) {
                    curveRewardBalanceAfter = new BN(
                        await curve.methods
                            .balanceOf(admin)
                            .call({ from: admin })
                    );
                    assert(
                        curveRewardBalanceAfter.eq(curveRewardBalanceBefore),
                        "expected curve balance after withdrawal to be greater than before withdrawal"
                    );
                }

                if (
                    GoodGhostingArtifact === GoodGhostingPolygon
                    || GoodGhostingArtifact === GoodGhostingPolygonWhitelisted
                ) {
                    rewardBalanceAfter = new BN(
                        await rewardToken.methods
                            .balanceOf(admin)
                            .call({ from: admin })
                    );
                }
                assert(
                    rewardBalanceAfter.eq(rewardBalanceBefore),
                    "expect rewards balance after withdrawal to be equal to before withdrawal"
                );

                truffleAssert.eventEmitted(
                    result,
                    "AdminWithdrawal",
                    (ev) => expectedAmount.eq(ev.adminFeeAmount),
                    "admin fee withdrawal event failure"
                );
            }
        });
    });
});