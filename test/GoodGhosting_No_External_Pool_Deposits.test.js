const GoodGhosting = artifacts.require("GoodGhosting");
const GoodGhostingPolygon = artifacts.require("GoodGhostingPolygon");
const ForceSend = artifacts.require("ForceSend");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const daiABI = require("../abi-external/dai-abi.json");
const configs = require("../deploy.config");
const whitelistedPlayerConfig = [
    {"0x49456a22bbED4Ae63d2Ec45085c139E6E1879A17": {index: 0, proof: ["0x8d49a056cfc62406d6824845a614366d64cc27684441621ef0e019def6e41398","0x73ffb6e5b1b673c6c13ec44ce753aa553a9e4dea224b10da5068ade50ce74de3"] }},
    {'0x4e7F88e38A05fFed54E0bE6d614C48138cE605Cf': {index: 1, proof: ["0xefc82954f8d1549053814986f191e870bb8e2b4efae54964a8831ddd1eaf6267","0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef"] }},
    {'0x78863CB2db754Fc45030c4c25faAf757188A0784': {index: 2, proof: ["0x6ecff5307e97b4034a59a6888301eaf1e5fdcc399163a89f6e886d1ed4a6614f","0x73ffb6e5b1b673c6c13ec44ce753aa553a9e4dea224b10da5068ade50ce74de3"] }},
    {'0xd1E80094e0f5f00225Ea5D962484695d57f3afaA': {index: 3, proof: ["0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324","0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef"] }},
    // invalid user
    {'0x7C3E8511863daF709bdBe243356f562e227573d4': {index: 3, proof: ["0x45533c7da4a9f550fb2a9e5efe3b6db62261670807ed02ce75cb871415d708cc","0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef","0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"]}}
]

contract("GoodGhosting_No_External_Pool_Deposit", (accounts) => {

    // Only executes this test file for local network fork
    if (!["local-mainnet-fork", "local-polygon-vigil-fork"].includes(process.env.NETWORK)) return;

    global.web3 = web3;
    const unlockedDaiAccount = process.env.DAI_ACCOUNT_HOLDER_FORKED_NETWORK;
    let providersConfigs;
    let GoodGhostingArtifact;
    if (process.env.NETWORK === "local-mainnet-fork") {
        GoodGhostingArtifact = GoodGhosting;
        providersConfigs     = configs.providers.aave.mainnet;
    } else {
        GoodGhostingArtifact = GoodGhostingPolygon;
        providersConfigs     = configs.providers.aave.polygon;
    }
    const { segmentCount, segmentLength, segmentPayment: segmentPaymentInt, earlyWithdrawFee } = configs.deployConfigs;
    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    let token;
    let rewardToken;
    let admin = accounts[0];
    const players = accounts.slice(1, 6); // 5 players
    const loser = players[0];
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(segmentPaymentInt)); // equivalent to 10 DAI
    let goodGhosting;

    describe("simulates a full game with 5 players and 4 of them winning the game with no external deposits", async () => {
        it("initializes contract instances and transfers DAI to players", async () => {
            token = new web3.eth.Contract(daiABI, providersConfigs.dai.address);
            rewardToken = new web3.eth.Contract(daiABI, providersConfigs.wmatic);
            goodGhosting = await GoodGhostingArtifact.deployed();
            // Send 1 eth to token address to have gas to transfer DAI.
            // Uses ForceSend contract, otherwise just sending a normal tx will revert.
            const forceSend = await ForceSend.new();
            await forceSend.go(token.options.address, { value: web3.utils.toWei("1", "Ether"), from: admin });
            const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
            const daiAmount = segmentPayment.mul(new BN(segmentCount)).toString();
            console.log("unlockedBalance: ", web3.utils.fromWei(unlockedBalance));
            console.log("daiAmountToTransfer", web3.utils.fromWei(daiAmount));
            for (let i = 0; i < players.length; i++) {
                const player = players[i];
                await token.methods
                    .transfer(player, daiAmount)
                    .send({ from: unlockedDaiAccount });
                const playerBalance = await token.methods.balanceOf(player).call({ from: admin });
                console.log(`player${i+1}DAIBalance`, web3.utils.fromWei(playerBalance));
            }
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
                    if (i === players.length - 1) {
                        await truffleAssert.reverts(goodGhosting.joinGame(whitelistedPlayerConfig[i][player].index, whitelistedPlayerConfig[i][player].proof, { from: player }), "MerkleDistributor: Invalid proof.");
                    } else {
                        const result = await goodGhosting.joinGame(whitelistedPlayerConfig[i][player].index, whitelistedPlayerConfig[i][player].proof, { from: player });
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
            }
        });

        it("runs the game - 'player1' early withdraws and other players complete game successfully", async () => {
            // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
            for (let segmentIndex = 1; segmentIndex < segmentCount; segmentIndex++) {
                await timeMachine.advanceTime(segmentLength);
                // NO DEPOSIT INTO EXTERNAL POOL
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
            // NO DEPOSIT INTO EXTERNAL POOL
            await timeMachine.advanceTime(segmentLength);
        });


        it("redeems funds from external pool", async () => {
            let eventAmount = new BN(0);
            const result = await goodGhosting.redeemFromExternalPool({ from: admin });
            const contractsDaiBalance = new BN(await token.methods.balanceOf(goodGhosting.address).call({ from: admin }));
            console.log("contractsDaiBalance", contractsDaiBalance.toString());
            truffleAssert.eventEmitted(
                result,
                "FundsRedeemedFromExternalPool",
                (ev) => {
                    console.log("totalContractAmount", ev.totalAmount.toString());
                    console.log("totalGamePrincipal", ev.totalGamePrincipal.toString());
                    console.log("totalGameInterest", ev.totalGameInterest.toString());
                    console.log("interestPerPlayer", ev.totalGameInterest.div(new BN(players.length - 1)).toString());
                    eventAmount = new BN(ev.totalAmount.toString());
                    return eventAmount.eq(contractsDaiBalance);
                },
                `FundsRedeemedFromExternalPool error - event amount: ${eventAmount.toString()}; expectAmount: ${contractsDaiBalance.toString()}`,
            );
        });

        it("players withdraw from contract", async () => {
            const playerPayment = new BN(segmentCount).mul(new BN(segmentPayment));
            // starts from 1, since player1 (loser), requested an early withdraw
            for (let i = 1; i < players.length - 1; i++) {
                const player = players[i];
                let playerMaticBalanceBeforeWithdraw;
                if (GoodGhostingArtifact === GoodGhostingPolygon) {
                    playerMaticBalanceBeforeWithdraw = new BN(await rewardToken.methods.balanceOf(player).call({ from: admin }));
                }
                const result = await goodGhosting.withdraw({ from: player });

                truffleAssert.eventEmitted(result, "Withdrawal", async (ev) => {
                    console.log(`player${i+1} withdraw amount: ${ev.amount.toString()}`);
                    const eventAmount = new BN(ev.amount.toString());
                    if (GoodGhostingArtifact === GoodGhostingPolygon) {
                        const playersMaticBalance = new BN(await rewardToken.methods.balanceOf(player).call({ from: admin }));
                        return ev.player === player && playerPayment.eq(eventAmount) && playersMaticBalance.eq(playerMaticBalanceBeforeWithdraw);
                    } else {
                        return ev.player === player && playerPayment.eq(eventAmount);
                    }
                }, "unable to withdraw amount");
            }
        });

        it("reverts if admin tries to withdraw fee collected since interest generated is 0", async () => {
            // due to no external deposit no interest is generated, hence thee fees is 0
            await truffleAssert.reverts(goodGhosting.adminFeeWithdraw({ from: admin }), "No Fees Earned");
        })
    });
});
