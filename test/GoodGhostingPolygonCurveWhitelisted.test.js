const { shouldBehaveLikeGoodGhostingPolygonCurveWhitelisted } = require("./GoodGhostingPolygonCurveWhitelisted.behavior");


contract("GoodGhostingPolygonCurveWhitelisted", (accounts) => {

    // Only executes this test file IF NOT a local network fork
    if (["local-mainnet-fork", "local-celo-fork", "local-polygon-vigil-fork",  "local-polygon-vigil-fork-curve", "local-polygon-whitelisted-vigil-fork", "local-polygon-whitelisted-vigil-fork-curve"].includes(process.env.NETWORK)) return;

    // Tests with Aave Pool
    shouldBehaveLikeGoodGhostingPolygonCurveWhitelisted(accounts, 0);
    
    // Tests with AtriCrypto Pool
    shouldBehaveLikeGoodGhostingPolygonCurveWhitelisted(accounts, 1);

});
