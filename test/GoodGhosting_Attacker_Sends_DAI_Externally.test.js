const GoodGhosting = artifacts.require("GoodGhosting");
const ForceSend = artifacts.require("ForceSend");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");
const daiABI = require("../abi-external/dai-abi.json");
const configs = require("../deploy.config");

contract("GoodGhosting", (accounts) => {

    // Only executes this test file for local network fork
    if (process.env.NETWORK !== "local-mainnet-fork") return;

    global.web3 = web3;
    const unlockedDaiAccount = process.env.DAI_ACCOUNT_HOLDER_FORKED_NETWORK;
    const providersConfigs = configs.providers.aave.mainnet;
    const { segmentCount, segmentLength, segmentPayment: segmentPaymentInt, earlyWithdrawFee } = configs.deployConfigs;
    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    let token;
    let admin = accounts[0];
    const players = accounts.slice(1, 6); // 5 players
    const loser = players[0];
    const attacker = accounts[7];
    const daiDecimals = web3.utils.toBN(1000000000000000000);
    const segmentPayment = daiDecimals.mul(new BN(segmentPaymentInt)); // equivalent to 10 DAI
    let goodGhosting;

    describe("simulates a full game with 5 players and 4 of them winning the game but considering an attacker sends extra funds transferred directly", async () => {
        it("initializes contract instances and transfers DAI to players", async () => {
            token = new web3.eth.Contract(daiABI, providersConfigs.dai.address);
            goodGhosting = await GoodGhosting.deployed();
            // Send 1 eth to token address to have gas to transfer DAI.
            // Uses ForceSend contract, otherwise just sending a normal tx will revert.
            const forceSend = await ForceSend.new();
            await forceSend.go(token.options.address, { value: web3.utils.toWei("1", "Ether"), from: admin });
            const unlockedBalance = await token.methods.balanceOf(unlockedDaiAccount).call({ from: admin });
            const daiAmount = daiDecimals.mul(new BN(1000)).toString();

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
            // DAI Transferred to the attacker
            await token.methods.transfer(attacker, daiAmount).send({ from: unlockedDaiAccount });
            // DAI Transferred directly to the contract without joining the game
            await token.methods.transfer(goodGhosting.address, daiAmount).send({ from: unlockedDaiAccount });
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
                // protocol deposit of the prev. deposit
                await goodGhosting.depositIntoExternalPool({ from: admin });

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
                for (let j = 1; j < players.length; j++) {
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
            await goodGhosting.depositIntoExternalPool({ from: admin });
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

        it("players withdraw from contract", async () => { // having test with only 1 player for now
            // starts from 1, since player1 (loser), requested an early withdraw
            for (let i = 1; i < players.length; i++) {
                const player = players[i];
                const userDaiBalance = new BN(await token.methods.balanceOf(player).call({ from: admin }));
                const result = await goodGhosting.withdraw({ from: player });
                truffleAssert.eventEmitted(result, "Withdrawal", (ev) => {
                    console.log(`player${i} withdraw amount: ${ev.amount.toString()}`);
                    return ev.player === player && !new BN(ev.amount.toString()).eq(userDaiBalance);
                }, "unable to withdraw amount");
            }
        });
    });
});
