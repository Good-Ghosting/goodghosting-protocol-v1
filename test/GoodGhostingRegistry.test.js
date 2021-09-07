/* global context */
const GoodGhostingRegistry = artifacts.require("GoodGhostingRegistry");
const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("MockERC20Mintable");
const GoodGhosting = artifacts.require("GoodGhosting");
const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require("ganache-time-traveler");
const truffleAssert = require("truffle-assertions");

contract("GoodGhostingRegistry", (accounts) => {
    // Only executes this test file IF NOT a local network fork
    if (["local-mainnet-fork", "local-polygon-vigil-fork", "local-polygon-whitelisted-vigil-fork"].includes(process.env.NETWORK)) return;

    const BN = web3.utils.BN; // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
    const admin = accounts[0];
    let token;
    let aToken;
    let goodGhosting, goodGhostingRegistry;
    let pap;
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
        goodGhosting = await GoodGhosting.new(
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
            { from: admin },
        );

        goodGhostingRegistry = await GoodGhostingRegistry.new(
            [goodGhosting.address],
            { from: admin }
        )
    });

    async function mintTokensFor(player) {
        await token.mint(player, toWad(1000), { from: admin });
    }

        describe("pre-flight checks", async () => {
        it("reverts if a null address is added to the registry", async () => {
            await truffleAssert.reverts(GoodGhostingRegistry.new(
                [ZERO_ADDRESS],
                { from: admin },
            ),
            "invalid _contract address");
        });

        it("reverts if there are two contracts being added and one is a null address", async () => {
            await truffleAssert.reverts(GoodGhostingRegistry.new(
                [goodGhosting.address, ZERO_ADDRESS],
                { from: admin },
            ),
            "invalid _contract address");
        });
        });

        describe("adding new contracts to the registry", async () => {
            it("reverts if a null address is added to the registry", async () => {
                await truffleAssert.reverts(goodGhostingRegistry.addContract(ZERO_ADDRESS, { from: admin }), "invalid _contract address");
            });

            it("revverts if a same contract is added again in the registry", async() => {
                const newPool = await GoodGhosting.new(
                    token.address,
                    pap.address,
                    segmentCount + 1,
                    segmentLength,
                    segmentPayment,
                    fee,
                    adminFee,
                    pap.address,
                    maxPlayersCount,
                    ZERO_ADDRESS,
                    { from: admin },
                );
                await goodGhostingRegistry.addContract(newPool.address, { from: admin })
                await truffleAssert.reverts(goodGhostingRegistry.addContract(newPool.address, { from: admin }), "contract already exists in the registry");
            })
    
            it("able to add a new address to the registry", async () => {
                const newPool = await GoodGhosting.new(
                    token.address,
                    pap.address,
                    segmentCount + 1,
                    segmentLength,
                    segmentPayment,
                    fee,
                    adminFee,
                    pap.address,
                    maxPlayersCount,
                    ZERO_ADDRESS,
                    { from: admin },
                );
                await goodGhostingRegistry.addContract(newPool.address, { from: admin })
                const poolExists = await goodGhostingRegistry.pools(newPool.address)
                assert(poolExists);
            });
            });

        describe("removing contracts from the registry", async () => {
                it("reverts if a non-existing address in the registry is removed", async () => {
                    await truffleAssert.reverts(goodGhostingRegistry.removeContract(ZERO_ADDRESS, { from: admin }), "contract does not exists in the registry");
                });
        
                it("able to remove a address from the registry", async () => {
                    const newPool = await GoodGhosting.new(
                        token.address,
                        pap.address,
                        segmentCount + 1,
                        segmentLength,
                        segmentPayment,
                        fee,
                        adminFee,
                        pap.address,
                        maxPlayersCount,
                        ZERO_ADDRESS,
                        { from: admin },
                    );
                    await goodGhostingRegistry.addContract(newPool.address, { from: admin })
                    await goodGhostingRegistry.removeContract(newPool.address, { from: admin })

                    const poolExists = await goodGhostingRegistry.pools(newPool.address)
                    assert(!poolExists);
                });
                });
    })
