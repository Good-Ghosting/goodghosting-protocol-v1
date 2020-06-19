const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("ERC20Mintable");
const GoodGhosting = artifacts.require("GoodGhosting");
const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { web3tx, wad4human, toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require('ganache-time-traveler');
const truffleAssert = require('truffle-assertions');




contract("GoodGhosting", accounts =>{
    const admin = accounts[0];
    let token;
    let aToken;
    let bank;
    let pap;
    let player1 = accounts[1];
    let MAX_UINT256;

    beforeEach( async ()=>{
        global.web3 = web3;
        MAX_UINT256 = 10;
        token = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")({
            from: admin
        });
        // using mint functioh (from isMintable to send tokens to player1)
        await web3tx(token.mint, "token.mint 1000 -> player1")(player1, toWad(1000), {
            from: admin
        });
        
        pap = await web3tx(LendingPoolAddressesProviderMock.new, "LendingPoolAddressesProviderMock.new")({from: admin});
        aToken = await IERC20.at(await pap.getLendingPool.call());
        await pap.setUnderlyingAssetAddress(token.address);
        bank = await web3tx(GoodGhosting.new, "GoodGhosting.new")(
            token.address,
            aToken.address,
            pap.address,
            {
                from: admin
            });

        console.log("bank ", bank.methods.daiToken);
    });

    it("should store dai address in contract", async()=>{
        // const metaCoinInstance = await MetaCoin.deployed();
        const result = await bank.getDaiTokenAddress();
        assert(result === token.address);
    });

    it("contract starts holding 0 Dai", async()=>{
        const contractsDaiBalance = await token.balanceOf(bank.address);
        assert(contractsDaiBalance.toNumber() === 0);
    });

    it("users can deposite dai after one time segment has passed", async()=>{
        const weekInSeconds = 604800;
        await timeMachine.advanceTime(weekInSeconds);
        await web3tx(token.approve, "token.approve to send tokens to contract")(
            bank.address,
            MAX_UINT256, {
                from: player1
            }
        );

        const result  = await web3tx(bank.makeDeposit, "token.approve to send tokens to contract")(
            {
                from: player1
            }
        );

        const contractsDaiBalance = await token.balanceOf(bank.address);
        assert(contractsDaiBalance.toNumber()==10);
        truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "payment made" && ev.reciever === player1;
        });
        truffleAssert.eventNotEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "too early to pay" && ev.reciever === player1;
        });
    });

    it("users can not deposit straight away", async()=>{
        await web3tx(token.approve, "token.approve to send tokens to contract")(
            bank.address,
            MAX_UINT256, {
                from: player1
            }
        );

        const result  = await web3tx(bank.makeDeposit, "token.approve to send tokens to contract")(
            {
                from: player1
            }
        );

        const contractsDaiBalance = await token.balanceOf(bank.address);
        assert(contractsDaiBalance.toNumber()==0);

        truffleAssert.eventNotEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "payment made" && ev.reciever === player1;
        });
        truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "too early to pay" && ev.reciever === player1;
        }); 
    });
    

    it("should this contract address", async()=>{
        // const metaCoinInstance = await MetaCoin.deployed();
        const result = await bank.getThisContractAddress();
        console.log("test", result);
        console.log("address", result);
        assert(result === bank.address);
    });

});

