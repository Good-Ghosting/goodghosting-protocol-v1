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
    const lastSegment = 16;
    let token;
    let aToken;
    let bank;
    let pap;
    let player1 = accounts[1];
    let player2 = accounts[2];
    let MAX_UINT256;
    const weekInSecs = 604800;
    // let aDai;

    beforeEach( async ()=>{
        global.web3 = web3;
        MAX_UINT256 = 10;
        token = await web3tx(ERC20Mintable.new, "ERC20Mintable.new")({
            from: admin
        });

        // creates dai for player1 to hold
        await web3tx(token.mint, "token.mint 1000 -> player1")(player1, toWad(1000), {
            from: admin
        });

        // deploys lending pool provide mocl
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

    // 🚨 TODO refactor to clean up
    it("can calculate current segment", async()=>{
        let currentSegment = new BigNumber(await bank.getCurrentSegment.call()).toNumber();
        let timeElapsed = new BigNumber(await bank.timeElapsed()).toNumber();
        let currentTime = new BigNumber(await bank.currentTime()).toNumber();
        assert(currentSegment === 0, `incorrectly calculating current segment: expected 0, actual ${currentSegment}`);

     
        // console.log("Half a week", halfAWeek);
        await timeMachine.advanceTimeAndBlock((weekInSecs));
        currentSegment = new BigNumber(await bank.getCurrentSegment.call()).toNumber();
        await timeMachine.advanceBlock();
        timeElapsed = new BigNumber(await bank.timeElapsed()).toNumber();
        currentTime = new BigNumber(await bank.currentTime()).toNumber();

        assert(currentSegment === 1, `incorrectly calculating current segment: expected 1, actual ${currentSegment}`);
        
        await timeMachine.advanceTimeAndBlock(weekInSecs + 345);
        currentSegment = new BigNumber(await bank.getCurrentSegment.call()).toNumber();
        await timeMachine.advanceBlock();
        const timeElapsed3 = await bank.timeElapsed();
        const currentTime3 = await bank.currentTime();
        assert(currentSegment === 2, `incorrectly calculating current segment: expected 1, actual ${currentSegment}`);
        await timeMachine.advanceTimeAndBlock(weekInSecs * 100);
        currentSegment = new BigNumber(await bank.getCurrentSegment.call()).toNumber();
        assert(currentSegment === 102, `incorrectly calculating current segment: expected 101, actual ${currentSegment}`);

    });

    it("users can deposite dai after one time segment has passed", async()=>{
        await web3tx(bank.joinGame, "join game")({from : player1});
 
        await timeMachine.advanceTimeAndBlock(weekInSecs);
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
        await web3tx(bank.joinGame, "join game")({from : player1});
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



    it("users can join the game in the first week", async ()=>{
        const result = await web3tx(bank.joinGame, "join the game")({from: player1});
        truffleAssert.eventEmitted(result, "SendMessage", (ev)=>{
            return  ev.message === "game joined" && ev.reciever === player1;
        }, "player was not able to join in the first segment");

    });

    it("users cannot join after the first segment", async()=>{
        await timeMachine.advanceTime(weekInSecs + 1);
        truffleAssert.reverts(
            bank.joinGame({ from: player1 }),
            "game has already started"
        );
    });

   it("registered players can call deposit", async()=>{
        await web3tx(bank.joinGame, "join game")({from : player1});
        const result = web3tx(bank.makeDeposit, "make a deposit")({from : player1});
        assert(result, "registered player could not make deposit");
    });

    it("unregistered players can not call deposit", async()=>{
        truffleAssert.reverts(
            bank.makeDeposit({ from: player2 }),
            "not registered"
        );
    });

    // for MVP I have hard coded the game length to be 16 weeks
    //🐞test passing when should fail - please fix
    xit("users can pay up to game deadline and then no more", async()=>{

        // first register to play the game
        await web3tx(bank.joinGame, "join game")({from : player1});

        for(var i = 1; i<= lastSegment + 1; i++){
            await timeMachine.advanceTime(weekInSecs +1);
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

            // once the game is over
            if(i === lastSegment + 1 ){
                assert(contractsDaiBalance.toNumber() == (10 * lastSegment), `balance of ${contractsDaiBalance.toNumber()} expected : ${(10 * lastSegment) } numberof segments ${lastSegment}`);
                
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
            
            const expectedBalance = 10 * i;
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
        await web3tx(bank.joinGame, "join game")({from : player1});
        let contractsDaiBalance = await token.balanceOf(bank.address);
        const overTwoWeeks = (weekInSecs * 2) + 1;
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

