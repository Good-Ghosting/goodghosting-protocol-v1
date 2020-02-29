const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("ERC20Mintable");
const ViralBank = artifacts.require("ViralBank");
const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { time, expectRevert } = require("@openzeppelin/test-helpers");
const { web3tx, wad4human, toWad } = require("@decentral.ee/web3-test-helpers");


contract("ViralBank", accounts => {
    const MAX_UINT256 = "115792089237316195423570985008687907853269984665640564039457584007913129639935";
    const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

    const admin = accounts[0];
    const patient0 = accounts[1];
    const patient1 = accounts[2];
    const patient2 = accounts[3];
    const patient3 = accounts[4];
    const patient4 = accounts[5];
    let token;
    let aToken;
    let bank;
    let pap;

    before(async () => {
        console.log("admin is", admin);
        console.log("patient0 is", patient0);
        console.log("patient1 is", patient1);
        console.log("patient2 is", patient2);
        console.log("patient3 is", patient3);
        console.log("patient4 is", patient4);
    });

    beforeEach(async () => {
        token = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")({
            from: admin
        });
        await web3tx(token.mint, "token.mint 1000 -> patient0")(patient0, toWad(1000), {
            from: admin
        });
        await web3tx(token.mint, "token.mint 1000 -> patient1")(patient1, toWad(1000), {
            from: admin
        });
        await web3tx(token.mint, "token.mint 1000 -> patient2")(patient2, toWad(1000), {
            from: admin
        });
        await web3tx(token.mint, "token.mint 1000 -> patient3")(patient3, toWad(1000), {
            from: admin
        });
        await web3tx(token.mint, "token.mint 1000 -> patient4")(patient4, toWad(1000), {
            from: admin
        });

        pap = await web3tx(LendingPoolAddressesProviderMock.new, "LendingPoolAddressesProviderMock.new")({
            from: admin
        });
        aToken = await IERC20.at(await pap.getLendingPool.call());

        bank = await web3tx(ViralBank.new, "ViralBank.new")(
            token.address,
            aToken.address,
            pap.address,
            {
                from: admin
            });
    });

    it("basic pandemic case", async () => {
        await web3tx(token.approve, "token.approve bank to infect patient0")(
            bank.address,
            MAX_UINT256, {
                from: patient0
            }
        );
        await web3tx(token.approve, "token.approve bank to infect patient1")(
            bank.address,
            MAX_UINT256, {
                from: patient1
            }
        );
        await web3tx(token.approve, "token.approve bank to infect patient2")(
            bank.address,
            MAX_UINT256, {
                from: patient2
            }
        );
        await web3tx(token.approve, "token.approve bank to infect patient3")(
            bank.address,
            MAX_UINT256, {
                from: patient3
            }
        );
        await web3tx(token.approve, "token.approve bank to infect patient4")(
            bank.address,
            MAX_UINT256, {
                from: patient4
            }
        );
        await web3tx(bank.startGame, "bank.startGame by patient0")(ZERO_ADDRESS, {
            from: patient0
        });
        assert.equal(wad4human(await token.balanceOf.call(patient0)), "990.10000");
        assert.equal(wad4human(await bank.balances.call(patient0)), "9.90000");

        await web3tx(bank.startGame, "bank.startGame of patient0 by patient1")(
            patient0, {
                from: patient1
            }
        );
        await web3tx(bank.buyInToRound, "bank.buyInToRound by patient1")({
            from: patient1
        });
        assert.equal(wad4human(await token.balanceOf.call(patient1)), "990.10000");
        assert.equal(wad4human(await bank.balances.call(patient1)), "9.90000");
    });

});
