/* global context */
const ERC20Mintable = artifacts.require("MockERC20Mintable");
const GoodGhostingPolygonCurveWhitelisted = artifacts.require("GoodGhostingPolygonCurveWhitelisted");
const IncentiveControllerMock = artifacts.require("IncentiveControllerMock");
const MockCurvePool = artifacts.require("MockCurvePool");
const MockCurveGauge = artifacts.require("MockCurveGauge");
const { toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

const coveragePlayerConfig = [
    { "0x49456a22bbED4Ae63d2Ec45085c139E6E1879A17": { index: 0, proof: ["0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"] } },
    { "0x4e7F88e38A05fFed54E0bE6d614C48138cE605Cf": { index: 1, proof: ["0x6ecff5307e97b4034a59a6888301eaf1e5fdcc399163a89f6e886d1ed4a6614f"] } },
    // invalid user
    { "0x78863CB2db754Fc45030c4c25faAf757188A0784": { index: 3, proof: ["0x45533c7da4a9f550fb2a9e5efe3b6db62261670807ed02ce75cb871415d708cc", "0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef", "0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"] } }
];
const testPlayerConfig = [
    { "0xf17f52151EbEF6C7334FAD080c5704D77216b732": { index: 1, proof: ["0x2882c9f01add5f1c877ca051d110e9e58fbedc3164a1ae605f2fb231e9d9fb70"] } },
    { "0xC5fdf4076b8F3A5357c5E395ab970B5B54098Fef": { index: 0, proof: ["0x93e8909af44acf5e2128ec9b84e3ba358ce1de36b5c9d6f9c61e14bb89a1d5f2"] } },
    // invalid user
    { "0x821aEa9a577a9b44299B9c15c88cf3087F3b5544": { index: 3, proof: ["0x45533c7da4a9f550fb2a9e5efe3b6db62261670807ed02ce75cb871415d708cc", "0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef", "0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324"] } }
];
function shouldBehaveLikeGoodGhostingPolygonCurveWhitelisted(accounts, poolType) {
    let merkleRoot;
    let whitelistedPlayerConfig;

    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let pool;
    let gauge;
    let curve;
    let goodGhosting;
    let contract;
    let incentiveController;
    let player1 = accounts[1];
    let player2 = accounts[2];
    const nonPlayer = accounts[3];

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
    const NUM_AAVE_POOL_TOKENS = 3;
    const NUM_ATRI_CRYPTO_POOL_TOKENS = 5;


    if (process.env.NETWORK.toLowerCase().includes("coverage")) {
        whitelistedPlayerConfig = coveragePlayerConfig;
        merkleRoot = "0x40867aa687de5ac616962b562ed033e36f9002c696ae408b9144e9f425ab166e";
    } else {
        whitelistedPlayerConfig = testPlayerConfig;
        merkleRoot = "0xd53ed7372825e2b21778b03e7f08246a9e358bf89416c856ebb4f196fca5e662";
    }
  
    async function mintTokensFor(player) {
        await token.mint(player, toWad(1000), { from: admin });
    }

    async function mintRewardsFor(to) {
        await incentiveController.mint(to, toWad(1000), { from: admin });
    }

    async function approveDaiToContract(fromAddr) {
        await token.approve(goodGhosting.address, segmentPayment, { from: fromAddr });
    }

    describe(`PoolType ${poolType} - ${poolType === 0 ? "Aave" : "AtriCrypto"} Pool`, async () => {

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
            await mintRewardsFor(gauge.address);
            await curve.mint(gauge.address, toWad(1000), { from: admin });

            goodGhosting = await GoodGhostingPolygonCurveWhitelisted.new(
                token.address,
                pool.address,
                tokenPosition,
                poolType,
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
                merkleRoot,
                { from: admin },
            );
        });

        describe("pre-flight checks", async () => {

            it("checks if player1 received minted DAI tokens", async () => {
                const usersDaiBalance = await token.balanceOf(player1);
                // BN.gte => greater than or equals (see https://github.com/indutny/bn.js/)
                assert(usersDaiBalance.div(daiDecimals).gte(new BN(1000)), `Player1 balance should be greater than or equal to 100 DAI at start - current balance: ${usersDaiBalance}`);
            });

            it("reverts if the contract is deployed with invalid pool address", async () => {
                await truffleAssert.reverts(GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    ZERO_ADDRESS,
                    tokenPosition,
                    poolType,
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
                    merkleRoot,
                    { from: admin },
                ),
                "invalid _pool address");
            });

            it("reverts if the contract is deployed with invalid gauge address", async () => {
                await truffleAssert.reverts(GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    tokenPosition,
                    poolType,
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
                    merkleRoot,
                    { from: admin },
                ),
                "invalid _gauge address");
            });

            it("reverts if the contract is deployed with invalid curve address", async () => {
                await truffleAssert.reverts(GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    tokenPosition,
                    poolType,
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
                    merkleRoot,
                    { from: admin },
                ),
                "invalid _curve address");
            });

            it("reverts if the contract is deployed with invalid pool type", async () => {
                await truffleAssert.reverts(GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    tokenPosition,
                    2,
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
                    merkleRoot,
                    { from: admin },
                ),
                "invalid _poolType value");
            });

            it("reverts if the contract is deployed with pool type ZERO and token position out of range", async () => {
                await truffleAssert.reverts(GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    NUM_AAVE_POOL_TOKENS, // 0-based index, so must revert; correct is NUM_AAVE_POOL_TOKENS - 1
                    0,
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
                    merkleRoot,
                    { from: admin },
                ),
                "invalid _inboundTokenIndex value for _poolType 0");
            });

            it("reverts if the contract is deployed with pool type ONE and token position out of range", async () => {
                await truffleAssert.reverts(GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    NUM_ATRI_CRYPTO_POOL_TOKENS, // 0-based index, so must revert; correct is NUM_ATRI_CRYPTO_POOL_TOKENS - 1
                    1,
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
                    merkleRoot,
                    { from: admin },
                ),
                "invalid _inboundTokenIndex value for _poolType 1");
            });


            it("allows deploying contract will pool type equal to ONE  and token position in the LOWER BOUND", async () => {
                const contract = await GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    0,
                    1,
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
                    merkleRoot,
                    { from: admin },
                );
                const poolType = await contract.poolType.call();
                assert(poolType.toString() === "1");                
            });


            it("allows deploying contract will pool type equal to ONE and token position in the UPPER BOUND", async () => {
                const contract = await GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    NUM_ATRI_CRYPTO_POOL_TOKENS - 1,
                    1,
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
                    merkleRoot,
                    { from: admin },
                );
                const poolType = await contract.poolType.call();
                assert(poolType.toString() === "1");                
            });

            it("allows deploying contract will pool type equal to ZERO and token position in the LOWER BOUND", async () => {
                const contract = await GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    0,
                    0,
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
                    merkleRoot,
                    { from: admin },
                );
                const poolType = await contract.poolType.call();
                assert(poolType.toString() === "0");                
            });

            it("allows deploying contract will pool type equal to ZERO and token position in the UPPER BOUND", async () => {
                const contract = await GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    NUM_AAVE_POOL_TOKENS - 1,
                    0,
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
                    merkleRoot,
                    { from: admin },
                );
                const poolType = await contract.poolType.call();
                assert(poolType.toString() === "0");
            });
        });

        describe("when the contract is deployed", async () => {
            it("checks if the contract's variables were properly initialized", async () => {
                const poolResult = await goodGhosting.pool.call();
                const gaugeResult = await goodGhosting.gauge.call();
                const curveResult = await goodGhosting.curve.call();
                const maticResult = await goodGhosting.matic.call();
                const inboundCurrencyResult = await goodGhosting.daiToken.call();
                const poolTypeResult = await goodGhosting.poolType.call();
                const lastSegmentResult = await goodGhosting.lastSegment.call();
                const segmentLengthResult = await goodGhosting.segmentLength.call();
                const segmentPaymentResult = await goodGhosting.segmentPayment.call();
                const earlyWithdrawFee = await goodGhosting.earlyWithdrawalFee.call();
                const adminFee = await goodGhosting.customFee.call();
                const maxPlayersCountResult = await goodGhosting.maxPlayersCount.call();
                const incentiveToken = await goodGhosting.incentiveToken.call();
                const merkleRootResult = await goodGhosting.merkleRoot.call();
              
                assert(poolResult === pool.address, `Pool address doesn't match. expected ${pool.address}; got ${poolResult}`);
                assert(gaugeResult === gauge.address, `Gauge address doesn't match. expected ${gauge.address}; got ${gaugeResult}`);
                assert(curveResult === curve.address, `Curve address doesn't match. expected ${curve.address}; got ${curveResult}`);
                assert(maticResult === incentiveController.address, `Matic address doesn't match. expected ${incentiveController.address}; got ${maticResult}`);
                assert(inboundCurrencyResult === token.address, `Inbound currency doesn't match. expected ${token.address}; got ${inboundCurrencyResult}`);
                assert(new BN(poolTypeResult).eq(new BN(poolType)), `PoolType doesn't match. expected ${poolType}; got ${poolTypeResult.toString()}`);
                assert(new BN(lastSegmentResult).eq(new BN(segmentCount)), `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`);
                assert(new BN(segmentLengthResult).eq(new BN(segmentLength)), `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`);
                assert(new BN(segmentPaymentResult).eq(new BN(segmentPayment)), `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`);
                assert(new BN(earlyWithdrawFee).eq(new BN(10)), `Early Withdraw Fee doesn't match, expected 10 got ${earlyWithdrawFee}`);
                assert(new BN(adminFee).eq(new BN(5)), `Admin Fee doesn't match, expected 5 got ${adminFee}`);
                assert(merkleRootResult === merkleRoot, `MerkleRoot doesn't match. expected ${merkleRoot}; got ${merkleRootResult}`);
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

            it("checks incentive token address is set", async () => {
                const incentiveToken = await ERC20Mintable.new("INCENTIVE", "INCENTIVE", { from: admin });
                const contract = await GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    tokenPosition,
                    poolType,
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
                    merkleRoot,
                    { from: admin },
                );
                const result = await contract.incentiveToken.call();
                assert(incentiveToken.address === result, "expected incentive token address to be set");
            });
        });

        describe("when an user tries to join a game", async () => {

            it("reverts if the user tries to join after the first segment", async () => {
                await timeMachine.advanceTime(weekInSecs);
                await approveDaiToContract(player1);
                await truffleAssert.reverts(goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof,0,{ from: player1 }), "Game has already started");
            });

            it("reverts if the user tries to join the game twice", async () => {
                await approveDaiToContract(player1);
                await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof,0,{ from: player1 });
                await approveDaiToContract(player1);
                await truffleAssert.reverts(goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof,0,{ from: player1 }), "Cannot join the game more than once");
            });

            it("reverts when non-whitelisted user tries to join using joinGame() joinWhitelistedGame(...)", async () => {
                await truffleAssert.reverts(goodGhosting.joinGame(0, { from: nonPlayer }), "Whitelisting enabled - use joinWhitelistedGame(uint256, bytes32[], uint256) instead");
            });

            it("reverts if a non-whitelisted player tries to join", async () => {
        
                contract = await GoodGhostingPolygonCurveWhitelisted.new(
                    token.address,
                    pool.address,
                    tokenPosition,
                    poolType,
                    gauge.address,
                    segmentCount,
                    segmentLength,
                    segmentPayment,
                    fee,
                    adminFee,
                    2,
                    curve.address,
                    incentiveController.address,
                    ZERO_ADDRESS,
                    merkleRoot,
                    { from: admin },
                );
                await token.approve(contract.address, segmentPayment, { from: player1 });
                await contract.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof,0,{ from: player1 });
                await token.approve(contract.address, segmentPayment, { from: player2 });
                await contract.joinWhitelistedGame(whitelistedPlayerConfig[1][player2].index, whitelistedPlayerConfig[1][player2].proof,0,{ from: player2 });
                await token.approve(contract.address, segmentPayment, { from: nonPlayer });
                await truffleAssert.reverts(contract.joinWhitelistedGame(whitelistedPlayerConfig[2][nonPlayer].index, whitelistedPlayerConfig[2][nonPlayer].proof, 0,{ from: nonPlayer,  gas: 6000000 }), "MerkleDistributor: Invalid proof");
            });

            it("increases activePlayersCount when a new player joins", async () => {
                const playerCountBefore = await goodGhosting.activePlayersCount.call();
                await approveDaiToContract(player1);
                await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof, 0,{ from: player1 });
                const playerCountAfter = await goodGhosting.activePlayersCount.call();
                assert(playerCountAfter.eq(playerCountBefore.add(new BN(1))));
            });

            it("stores the player(s) who joined the game", async () => {
                // Player1 joins the game
                await approveDaiToContract(player1);
                await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof,0,{ from: player1 });

                await approveDaiToContract(player2);
                await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[1][player2].index, whitelistedPlayerConfig[1][player2].proof, 0,{ from: player2 });

                // Reads stored players and compares against player1 and player2
                // Remember: "iterablePlayers" is an array, so we need to pass the index we want to retrieve.
                const storedPlayer1 = await goodGhosting.iterablePlayers.call(0);
                const storedPlayer2 = await goodGhosting.iterablePlayers.call(1);
                assert(storedPlayer1 === player1);
                assert(storedPlayer2 === player2);

                // Checks player's info stored in the struct.
                const playerInfo1 = await goodGhosting.players(player1);
                assert(playerInfo1.mostRecentSegmentPaid.eq(new BN(0)));
                assert(playerInfo1.amountPaid.eq(segmentPayment));
                assert(playerInfo1.canRejoin === false);
                assert(playerInfo1.withdrawn === false);

                const playerInfo2 = await goodGhosting.players(player1);
                assert(playerInfo2.mostRecentSegmentPaid.eq(new BN(0)));
                assert(playerInfo2.amountPaid.eq(segmentPayment));
                assert(playerInfo2.canRejoin === false);
                assert(playerInfo2.withdrawn === false);
            });

            it("emits the event JoinedGame", async () => {
                await approveDaiToContract(player1);
                const result = await goodGhosting.joinWhitelistedGame(whitelistedPlayerConfig[0][player1].index, whitelistedPlayerConfig[0][player1].proof,0,{ from: player1 });
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
    })
}
module.exports = {
    shouldBehaveLikeGoodGhostingPolygonCurveWhitelisted,
};
