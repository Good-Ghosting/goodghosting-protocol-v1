const { shouldBehaveLikeGoodGhostingPolygonCurve } = require("./GoodGhostingPolygonCurve.behavior");


contract("GoodGhostingPolygonCurve", (accounts) => {

    // Only executes this test file IF NOT a local network fork
    if (["local-mainnet-fork", "local-celo-fork", "local-polygon-vigil-fork",  "local-polygon-vigil-fork-curve", "local-polygon-whitelisted-vigil-fork", "local-polygon-whitelisted-vigil-fork-curve"].includes(process.env.NETWORK)) return;

    // Tests with Aave Pool
    shouldBehaveLikeGoodGhostingPolygonCurve(accounts, 0);
    
    // Tests with AtriCrypto Pool
    shouldBehaveLikeGoodGhostingPolygonCurve(accounts, 1);

});
