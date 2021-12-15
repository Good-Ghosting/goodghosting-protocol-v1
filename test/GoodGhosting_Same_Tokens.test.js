const GoodGhostingPolygon = artifacts.require("GoodGhostingPolygon");

const ForceSend = artifacts.require("ForceSend");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const daiABI = require("../abi-external/dai-abi.json");
const configs = require("../deploy.config");

contract("GoodGhosting Pool with same deposit and reward tokens", (accounts) => {
    // Only executes this test file for local network fork
    if (
        ![
            "local-polygon-same-tokens-vigil-fork"
        ].includes(process.env.NETWORK)
    )
        return;

    global.web3 = web3;
    const unlockedDaiAccount = process.env.DAI_ACCOUNT_HOLDER_FORKED_NETWORK;
    const providersConfigs = configs.providers.aave.polygon;
    const GoodGhostingArtifact = GoodGhostingPolygon;

    const {
        segmentCount,
        segmentLength,
        segmentPayment: segmentPaymentInt,
        customFee,
        maxPlayersCount,
    } = configs.deployConfigs;
    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    let rewardToken;
    let admin = accounts[0];
    const players = accounts.slice(1, 6); // 5 players
    const loser = players[0];
    const userWithdrawingAfterLastSegment = players[1];
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(segmentPaymentInt)); // equivalent to 10 DAI
    let goodGhosting;

    describe("simulates a full game with 5 players and 4 of them winning the game and with admin fee % as 0", async () => {
        it("initializes contract instances and transfers DAI to players", async () => {
            rewardToken = new web3.eth.Contract(
                daiABI,
                providersConfigs.wmatic
            );
            goodGhosting = await GoodGhostingArtifact.deployed();
            // Send 1 eth to token address to have gas to transfer DAI.
            // Uses ForceSend contract, otherwise just sending a normal tx will revert.
            const forceSend = await ForceSend.new();
            await forceSend.go(providersConfigs.wmatic, {
                value: web3.utils.toWei("1", "Ether"),
                from: admin,
            });
            const unlockedBalance = await rewardToken.methods
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
                await rewardToken.methods
                    .transfer(player, transferAmount)
                    .send({ from: unlockedDaiAccount });
                const playerBalance = await rewardToken.methods
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
            console.log(inboundCurrencyResult.toLowerCase())
            console.log(providersConfigs.wmatic.toLowerCase())

            const lendingPoolAddressProviderResult = await goodGhosting.lendingPoolAddressProvider.call();
            const lastSegmentResult = await goodGhosting.lastSegment.call();
            const segmentLengthResult = await goodGhosting.segmentLength.call();
            const segmentPaymentResult = await goodGhosting.segmentPayment.call();
            const expectedSegment = new BN(0);
            const currentSegmentResult = await goodGhosting.getCurrentSegment.call();
            const maxPlayersCountResult = await goodGhosting.maxPlayersCount.call();
            assert(
                inboundCurrencyResult.toLowerCase() === providersConfigs.wmatic.toLowerCase(),
                `Inbound currency doesn't match. expected ${providersConfigs.wmatic} got ${inboundCurrencyResult}`
            );
            assert(
                lendingPoolAddressProviderResult ===
                providersConfigs.lendingPoolAddressProvider,
                `LendingPoolAddressesProvider doesn't match. expected ${providersConfigs.dataProvider}; got ${lendingPoolAddressProviderResult}`
            );
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
            for (let i = 0; i < players.length; i++) {
                const player = players[i];

                let playerEvent = "";
                let paymentEvent = 0;
                const result = await goodGhosting.joinGame({ from: player, value: segmentPayment });
                // player 1 early withdraws in segment 0 and joins again
                if (i == 1) {
                    await goodGhosting.earlyWithdraw({ from: player });
                    await rewardToken.methods
                        .approve(
                            goodGhosting.address,
                            segmentPayment
                                .mul(new BN(segmentCount))
                                .toString()
                        )
                        .send({ from: player });
                    await goodGhosting.joinGame({ from: player, value: segmentPayment });
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
        });

        it("runs the game - 'player1' early withdraws and other players complete game successfully", async () => {
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
                    const depositResult = await goodGhosting.makeDeposit({
                        from: player, value: segmentPayment
                    });
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
            let eventAmount = new BN(0);
            const result = await goodGhosting.redeemFromExternalPool({
                from: admin,
            });
            const contractMaticBalance = await web3.eth.getBalance(goodGhosting.address)
            console.log("contractsDaiBalance", contractMaticBalance.toString());
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
                        eventAmount.eq(new BN(contractMaticBalance)) &&
                        adminFee.lt(ev.totalGameInterest)
                    );
                },
                `FundsRedeemedFromExternalPool error - event amount: ${eventAmount.toString()}; expectAmount: ${contractMaticBalance.toString()}`
            );
        });

        it("players withdraw from contract", async () => {
            // starts from 2, since player1 (loser), requested an early withdraw and player 2 withdrew after the last segment
            for (let i = 2; i < players.length - 1; i++) {
                const player = players[i];

                const result = await goodGhosting.withdraw({ from: player });


                truffleAssert.eventEmitted(
                    result,
                    "Withdrawal",
                    async (ev) => {
                        console.log(
                            `player${i} withdraw amount: ${ev.amount.toString()}`
                        );
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

                const result = await goodGhosting.adminFeeWithdraw({
                    from: admin,
                });


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
