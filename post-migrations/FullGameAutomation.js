const Web3 = require("web3");
const daiABI = require("../abi-external/dai-abi.json");
const BN = Web3.utils.BN;
let web3;


const whitelistedPlayerConfig = [
    {"0x49456a22bbED4Ae63d2Ec45085c139E6E1879A17": {index: 0, proof: ["0x8d49a056cfc62406d6824845a614366d64cc27684441621ef0e019def6e41398","0x73ffb6e5b1b673c6c13ec44ce753aa553a9e4dea224b10da5068ade50ce74de3"] }},
    {"0x4e7F88e38A05fFed54E0bE6d614C48138cE605Cf": {index: 1, proof: ["0xefc82954f8d1549053814986f191e870bb8e2b4efae54964a8831ddd1eaf6267","0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef"] }},
    {"0x78863CB2db754Fc45030c4c25faAf757188A0784": {index: 2, proof: ["0x6ecff5307e97b4034a59a6888301eaf1e5fdcc399163a89f6e886d1ed4a6614f","0x73ffb6e5b1b673c6c13ec44ce753aa553a9e4dea224b10da5068ade50ce74de3"] }},
    {"0xd1E80094e0f5f00225Ea5D962484695d57f3afaA": {index: 3, proof: ["0xc0afcf89a6f3a0adc4f9753a170e9be8a76083ff27004c10b5fb55db34079324","0x10b900833bd5f4efa3f47f034cf1d4afd8f4de59b50e0cdc2f0c2e0847caecef"] }},
];



function assertOrFail (condition, msg) {
    if (!condition) {
        throw new Error(msg);
    }
}

async function checkGameConfigs(
    contract,
    admin,
    { segmentCount, segmentLength, segmentPaymentWei, segmentPayment }
) {
    const lastSegmentResult = new BN(await contract.lastSegment.call());
    const segmentLengthResult = new BN(await contract.segmentLength.call());
    const segmentPaymentResult = new BN(await contract.segmentPayment.call());
    const expectedSegment = new BN(0);
    const currentSegmentResult = await contract.getCurrentSegment.call({ from: admin });
    assertOrFail(lastSegmentResult.eq(new BN(segmentCount)), `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`);
    assertOrFail(segmentLengthResult.eq(new BN(segmentLength)), `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`);
    assertOrFail(segmentPaymentResult.eq(new BN(segmentPaymentWei)), `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`);
    assertOrFail(currentSegmentResult.eq(expectedSegment), `should start at segment ${0} but started at ${currentSegmentResult.toNumber()} instead.`);
}

async function approveContractAndJoinGame(contract, players, { inboundCurrencyAddress, segmentCount, segmentPaymentWei }) {
    const token = new web3.eth.Contract(daiABI, inboundCurrencyAddress);
    for (let i = 0; i < 4; i++) {
        const player = players[i];

        await token.methods
            .approve(
                contract.address,
                new BN(segmentPaymentWei).mul(new BN(segmentCount)).toString()
            ).send({ from: player });

        // await contract.joinGame(
        //     whitelistedPlayerConfig[i][player].index,
        //     whitelistedPlayerConfig[i][player].proof,
        //     { from: player }
        // );
    }
}


/**
 * 
 * @param {GoodGhosting} contract deployed contract instance
 * @param {String} admin address of admin account
 * @param {Array} players array of players
 * @param {Object} deployConfigs deployment configs passed to the contract
 */
module.exports = async function runFullGame(
    web3Instance,
    contract,
    admin,
    players,
    {
        inboundCurrencyAddress,
        lendingPoolAddressProvider,
        segmentCount,
        segmentLength,
        segmentPaymentWei,
        earlyWithdrawFee,
        customFee,
        dataProviderAddress,
        merkelRoot
    },
    // additional logging info
    {
        networkName,
        selectedProvider,
        inboundCurrencySymbol,
        segmentPayment,
    }
) {
    console.log("full game simulation - started");

    web3 = web3Instance;

    await checkGameConfigs(
        contract,
        admin,
        { segmentCount, segmentLength, segmentPaymentWei, segmentPayment }
    );
    await approveContractAndJoinGame(
        contract,
        players,
        { inboundCurrencyAddress, segmentCount, segmentPaymentWei },
    );

    console.log("full game simulation - completed");
};
