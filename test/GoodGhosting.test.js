const IERC20 = artifacts.require("IERC20");
const ERC20Mintable = artifacts.require("ERC20Mintable");
const GoodGhosting = artifacts.require("GoodGhosting");
const LendingPoolAddressesProviderMock = artifacts.require("LendingPoolAddressesProviderMock");
const { web3tx, wad4human, toWad } = require("@decentral.ee/web3-test-helpers");
const timeMachine = require('ganache-time-traveler');
const truffleAssert = require('truffle-assertions');
const BigNumber = require("bignumber.js");



contract("GoodGhosting", accounts =>{
    const admin = accounts[0];
    const numberOfSegments = 16;
    let token;
    let aToken;
    let bank;
    let pap;
    let player1 = accounts[1];
    let MAX_UINT256;
    // let aDai;

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

        // aDai = await web3tx(ERC20Mintable.new, "ERC20Mintable for aDAI")({
        //     from : admin
        // });
        
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
    });

    it("should store dai address in contract", async()=>{
        const result = await bank.getDaiTokenAddress();
        assert(result === token.address, "dai address not stored in contract");
    });

    it("dai and adai are two seperate addresses", async()=>{
        const daiAdd = token.address;
        const aDaiAdd = pap.address;
        console.log(`DAI ${daiAdd} and ADAI ${aDaiAdd} the same address `)
        assert(daiAdd != aDaiAdd, `DAI ${daiAdd} and ADAI ${aDaiAdd} the same address `)

    });

 
    it("contract starts holding 0 Dai and 0", async()=>{
        const contractsDaiBalance = await token.balanceOf(bank.address);
        const contractsADaiBalance = await pap.balanceOf(bank.address);
        assert(contractsDaiBalance.toNumber() === 0 && contractsDaiBalance.toNumber() === 0, `at game start, smart contract holds: ${contractsDaiBalance.toNumber()} DAI, ${contractsADaiBalance.toNumber()} ADAI` );
    });

    it("user starts holding more than 10 Dai", async()=>{
        const usersDaiBalance = await token.balanceOf(player1);
        assert(new BigNumber(usersDaiBalance) > 10, `User has 10 or less dai at start, balance: ${usersDaiBalance}`);
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
        const contractsADaiBalance = await pap.balanceOf(bank.address);
        assert(contractsDaiBalance.toNumber()==0 && contractsADaiBalance.toNumber() === 10, `contract did not recieve dai - DAI ${contractsDaiBalance} ADAI ${contractsADaiBalance}`);
    
        truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "payment made" && ev.reciever === player1;
        }, "did not emit payment made message");
        truffleAssert.eventNotEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "too early to pay" && ev.reciever === player1;
        }, "did not emit to early to pay messgae");
    });

    it("users can not deposit straight away", async()=>{
        await web3tx(token.approve, "token.approve to send tokens to contract")(
            bank.address,
            MAX_UINT256, {
                from: player1
            }
        );

        const result = await web3tx(bank.makeDeposit, "token.approve to send tokens to contract")(
            {
                from: player1
            }
        );

        const contractsDaiBalance = await token.balanceOf(bank.address);
        assert(contractsDaiBalance.toNumber()==0, "users were able to deposit dai ahead of time");

        truffleAssert.eventNotEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "payment made" && ev.reciever === player1;
        },"emitted false payment made message");
        truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "too early to pay" && ev.reciever === player1;
        }, " did not emit too early to pay message"); 
    });


    const weekInSeconds = 604800;

    it("users can join the game in the first week", async ()=>{
        const result = await web3tx(bank.joinGame, "join the game")({from: player1});
        truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "game joined" && ev.reciever === player1;
        }, "player was not able to join in the first segment");

    });

    it("users cannot join after the first segment", async()=>{
        await timeMachine.advanceTime(weekInSeconds + 1);
        truffleAssert.reverts(
            bank.joinGame({ from: player1 }),
            "game has already started"
        );

    });
    // for MVP I have hard coded the game length to be 16 weeks
    it("users can pay up to game deadline and then no more", async()=>{
        for(var i = i; i<= numberOfSegments + 1; i++){
            await timeMachine.advanceTime(weekInSeconds * 3);
            await web3tx(token.approve, "token.approve to send tokens to contract")(
                bank.address,
                MAX_UINT256, {
                    from: player1
                }
            );
    
            const result = await web3tx(bank.makeDeposit, "token.approve to send tokens to contract")(
                {
                    from: player1
                }
            );

            const contractsDaiBalance = await token.balanceOf(bank.address);
            if(i === numberOfSegments + 1 ){
                assert(contractsDaiBalance.toNumber() == (10 * numberOfSegments), `balance of ${contractsDaiBalance.toNumber()} expected : ${(10 * numberOfSegments) } numberof segments ${numberOfSegments}`);
                
                truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
                    return  ev.message === "game finished" && ev.reciever === player1;
                }, "did not emit game finished message");
                
                truffleAssert.eventNotEmitted(result, "SendMessage", (ev)=>{
                    return  ev.message === "too early to pay" && ev.reciever === player1;
                }, "emitted false to early to pay message");
                
                truffleAssert.eventNotEmitted(result, "SendMessage", (ev)=>{
                    return  ev.message === "payment made" && ev.reciever === player1;
                }, "emitted false payment made message");
                return;
            }
            
            const expectedBalance = 10 * (i + 1);
            const mostRecentSegmentPaid = await bank.getMostRecentSegmentPaid();

            assert(contractsDaiBalance.toNumber()=== expectedBalance, `incorrect balance of ${contractsDaiBalance.toNumber()} in smart contract on iteration ${i}, expected ${expectedBalance}, most recent segment paid ${mostRecentSegmentPaid}`);
            
            truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
                return  ev.message === "payment made" && ev.reciever === player1;
            }, "payment made message not sent" );

            truffleAssert.eventNotEmitted(result, "SendMessage", (ev)=>{
                return  ev.message === "too early to pay" && ev.reciever === player1;
            }, "emitted false to early to pay message");
        }

    });

    it('users can not play if they missed paying in to the previous segment', async()=>{
        let contractsDaiBalance = await token.balanceOf(bank.address);
        const overTwoWeeks = (weekInSeconds * 2) + 1;
        await timeMachine.advanceTime(overTwoWeeks);
        await web3tx(token.approve, "token.approve to send tokens to contract")(
            bank.address,
            MAX_UINT256, {
                from: player1
            }
        );

        const result = await web3tx(bank.makeDeposit, "token.approve to send tokens to contract")(
            {
                from: player1
            }
        );

        contractsDaiBalance = await token.balanceOf(bank.address);
        assert(contractsDaiBalance.toNumber()==0, `users able to pay despite being out of the game. Contract balance ${contractsDaiBalance}`);

        truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "out of game, not possible to deposit" && ev.reciever === player1;
        });
    });




    
    // TODO refactor this test to check from public var and remove
    it("should this contract address", async()=>{
        const result = await bank.getThisContractAddress();
        assert(result === bank.address);
    });

});

