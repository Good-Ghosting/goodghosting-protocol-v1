/* global context */
const ERC20Mintable = artifacts.require('MockERC20Mintable')
const GoodGhostingPolygonCurve = artifacts.require('GoodGhostingPolygonCurve')
const IncentiveControllerMock = artifacts.require('IncentiveControllerMock')
const MockCurvePool = artifacts.require('MockCurvePool')
const MockCurveGauge = artifacts.require('MockCurveGauge')
const ethers = require('ethers')
const { toWad } = require('@decentral.ee/web3-test-helpers')
const timeMachine = require('ganache-time-traveler')
const truffleAssert = require('truffle-assertions')

function shouldBehaveLikeGoodGhostingPolygonCurve(accounts, poolType) {
  const BN = web3.utils.BN // https://web3js.readthedocs.io/en/v1.2.7/web3-utils.html#bn
  const admin = accounts[0]
  let token
  let pool
  let gauge
  let curve
  let goodGhosting
  let contract
  let incentiveController
  let player1 = accounts[1]
  let player2 = accounts[2]
  const nonPlayer = accounts[9]

  const weekInSecs = 180
  const fee = 10 // represents 10%
  const adminFee = 5 // represents 5%
  const daiDecimals = web3.utils.toBN(1000000000000000000)
  const segmentPayment = daiDecimals.mul(new BN(10)) // equivalent to 10 DAI
  const segmentCount = 6
  const segmentLength = 180
  const maxPlayersCount = new BN(100)
  const tokenPosition = 0
  const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
  const NUM_AAVE_POOL_TOKENS = 3
  const NUM_ATRI_CRYPTO_POOL_TOKENS = 5

  async function mintTokensFor(player) {
    await token.mint(player, toWad(1000), { from: admin })
  }

  async function mintRewardsFor(to) {
    await incentiveController.mint(to, toWad(1000), { from: admin })
  }

  async function approveDaiToContract(fromAddr) {
    await token.approve(goodGhosting.address, segmentPayment, {
      from: fromAddr,
    })
  }

  async function advanceToEndOfGame() {
    // We need to to account for the first deposit window.
    // i.e., if game has 5 segments, we need to add + 1, because while current segment was 0,
    // it was just the first deposit window and game was not started yet.
    await timeMachine.advanceTime(weekInSecs * (segmentCount + 1))
  }

  async function joinGamePaySegmentsAndComplete(player, contractInstance) {
    let contract = contractInstance
    if (!contract) {
      contract = goodGhosting
    }
    await approveDaiToContract(player)
    await contract.joinGame(0, { from: player })
    // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
    for (let index = 1; index < segmentCount; index++) {
      await timeMachine.advanceTime(weekInSecs)
      await approveDaiToContract(player)
      await contract.makeDeposit(0, { from: player })
    }
    // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
    // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
    await timeMachine.advanceTime(weekInSecs * 2)
  }

  async function joinGameMissLastPaymentAndComplete(player) {
    await approveDaiToContract(player)
    await goodGhosting.joinGame(0, { from: player })
    // pay all remaining segments except last one
    for (let index = 1; index < segmentCount - 1; index++) {
      await timeMachine.advanceTime(weekInSecs)
      await approveDaiToContract(player)
      await goodGhosting.makeDeposit(0, { from: player })
    }
    // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 2.
    // now, we move 3 more segments (segmentCount-2, segmentCount-1 and segmentCount) to complete the game.
    await timeMachine.advanceTime(weekInSecs * 3)
  }

  describe(`PoolType ${poolType} - ${
    poolType === 0 ? 'Aave' : 'AtriCrypto'
  } Pool`, async () => {
    beforeEach(async () => {
      global.web3 = web3
      incentiveController = await IncentiveControllerMock.new(
        'TOKEN_NAME',
        'TOKEN_SYMBOL',
        { from: admin },
      )
      token = await ERC20Mintable.new('MINT', 'MINT', { from: admin })
      curve = await ERC20Mintable.new('CURVE', 'CURVE', { from: admin })
      pool = await MockCurvePool.new('LP', 'LP', token.address, { from: admin })
      gauge = await MockCurveGauge.new(
        'GAUGE',
        'GAUGE',
        curve.address,
        pool.address,
        incentiveController.address,
        { from: admin },
      )
      // creates dai for player1 to hold.
      // Note DAI contract returns value to 18 Decimals
      // so token.balanceOf(address) should be converted with BN
      // and then divided by 10 ** 18
      await mintTokensFor(player1)
      await mintTokensFor(player2)
      await mintRewardsFor(gauge.address)
      await curve.mint(gauge.address, toWad(1000), { from: admin })

      goodGhosting = await GoodGhostingPolygonCurve.new(
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
        { from: admin },
      )
    })

    describe('pre-flight checks', async () => {
      it('checks if player1 received minted DAI tokens', async () => {
        const usersDaiBalance = await token.balanceOf(player1)
        // BN.gte => greater than or equals (see https://github.com/indutny/bn.js/)
        assert(
          usersDaiBalance.div(daiDecimals).gte(new BN(1000)),
          `Player1 balance should be greater than or equal to 100 DAI at start - current balance: ${usersDaiBalance}`,
        )
      })

      it('reverts if the contract is deployed with invalid pool address', async () => {
        await truffleAssert.reverts(
          GoodGhostingPolygonCurve.new(
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
            { from: admin },
          ),
          'invalid _pool address',
        )
      })

      it('reverts if the contract is deployed with invalid gauge address', async () => {
        await truffleAssert.reverts(
          GoodGhostingPolygonCurve.new(
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
            { from: admin },
          ),
          'invalid _gauge address',
        )
      })

      it('reverts if the contract is deployed with invalid curve address', async () => {
        await truffleAssert.reverts(
          GoodGhostingPolygonCurve.new(
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
            { from: admin },
          ),
          'invalid _curve address',
        )
      })

      it('reverts if the contract is deployed with invalid pool type', async () => {
        await truffleAssert.reverts(
          GoodGhostingPolygonCurve.new(
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
            { from: admin },
          ),
          'invalid _poolType value',
        )
      })

      it('reverts if the contract is deployed with pool type ZERO and token position out of range', async () => {
        await truffleAssert.reverts(
          GoodGhostingPolygonCurve.new(
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
            { from: admin },
          ),
          'invalid _inboundTokenIndex value for _poolType 0',
        )
      })

      it('reverts if the contract is deployed with pool type ONE and token position out of range', async () => {
        await truffleAssert.reverts(
          GoodGhostingPolygonCurve.new(
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
            { from: admin },
          ),
          'invalid _inboundTokenIndex value for _poolType 1',
        )
      })

      it('allows deploying contract will pool type equal to ONE  and token position in the LOWER BOUND', async () => {
        const contract = await GoodGhostingPolygonCurve.new(
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
          { from: admin },
        )
        const poolType = await contract.poolType.call()
        assert(poolType.toString() === '1')
      })

      it('allows deploying contract will pool type equal to ONE and token position in the UPPER BOUND', async () => {
        const contract = await GoodGhostingPolygonCurve.new(
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
          { from: admin },
        )
        const poolType = await contract.poolType.call()
        assert(poolType.toString() === '1')
      })

      it('allows deploying contract will pool type equal to ZERO and token position in the LOWER BOUND', async () => {
        const contract = await GoodGhostingPolygonCurve.new(
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
          { from: admin },
        )
        const poolType = await contract.poolType.call()
        assert(poolType.toString() === '0')
      })

      it('allows deploying contract will pool type equal to ZERO and token position in the UPPER BOUND', async () => {
        const contract = await GoodGhostingPolygonCurve.new(
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
          { from: admin },
        )
        const poolType = await contract.poolType.call()
        assert(poolType.toString() === '0')
      })
    })

    describe('when the contract is deployed', async () => {
      it("checks if the contract's variables were properly initialized", async () => {
        const poolResult = await goodGhosting.pool.call()
        const gaugeResult = await goodGhosting.gauge.call()
        const curveResult = await goodGhosting.curve.call()
        const maticResult = await goodGhosting.matic.call()
        const inboundCurrencyResult = await goodGhosting.daiToken.call()
        const poolTypeResult = await goodGhosting.poolType.call()
        const lastSegmentResult = await goodGhosting.lastSegment.call()
        const segmentLengthResult = await goodGhosting.segmentLength.call()
        const segmentPaymentResult = await goodGhosting.segmentPayment.call()
        const earlyWithdrawFee = await goodGhosting.earlyWithdrawalFee.call()
        const adminFee = await goodGhosting.customFee.call()
        const maxPlayersCountResult = await goodGhosting.maxPlayersCount.call()
        const incentiveToken = await goodGhosting.incentiveToken.call()

        assert(
          poolResult === pool.address,
          `Pool address doesn't match. expected ${pool.address}; got ${poolResult}`,
        )
        assert(
          gaugeResult === gauge.address,
          `Gauge address doesn't match. expected ${gauge.address}; got ${gaugeResult}`,
        )
        assert(
          curveResult === curve.address,
          `Curve address doesn't match. expected ${curve.address}; got ${curveResult}`,
        )
        assert(
          maticResult === incentiveController.address,
          `Matic address doesn't match. expected ${incentiveController.address}; got ${maticResult}`,
        )
        assert(
          inboundCurrencyResult === token.address,
          `Inbound currency doesn't match. expected ${token.address}; got ${inboundCurrencyResult}`,
        )
        assert(
          new BN(poolTypeResult).eq(new BN(poolType)),
          `PoolType doesn't match. expected ${poolType}; got ${poolTypeResult.toString()}`,
        )
        assert(
          new BN(lastSegmentResult).eq(new BN(segmentCount)),
          `LastSegment info doesn't match. expected ${segmentCount}; got ${lastSegmentResult}`,
        )
        assert(
          new BN(segmentLengthResult).eq(new BN(segmentLength)),
          `SegmentLength doesn't match. expected ${segmentLength}; got ${segmentLengthResult}`,
        )
        assert(
          new BN(segmentPaymentResult).eq(new BN(segmentPayment)),
          `SegmentPayment doesn't match. expected ${segmentPayment}; got ${segmentPaymentResult}`,
        )
        assert(
          new BN(earlyWithdrawFee).eq(new BN(10)),
          `Early Withdraw Fee doesn't match, expected 10 got ${earlyWithdrawFee}`,
        )
        assert(
          new BN(adminFee).eq(new BN(5)),
          `Admin Fee doesn't match, expected 5 got ${adminFee}`,
        )
        assert(
          new BN(maxPlayersCountResult).eq(maxPlayersCount),
          `MaxPlayersCount doesn't match. expected ${maxPlayersCount.toString()}; got ${maxPlayersCountResult}`,
        )
        assert(incentiveToken === ZERO_ADDRESS)
      })

      it('checks if game starts at segment zero', async () => {
        const expectedSegment = new BN(0)
        const result = await goodGhosting.getCurrentSegment.call({
          from: admin,
        })
        assert(
          result.eq(new BN(0)),
          `should start at segment ${expectedSegment} but started at ${result.toNumber()} instead.`,
        )
      })

      it('checks incentive token address is set', async () => {
        const incentiveToken = await ERC20Mintable.new(
          'INCENTIVE',
          'INCENTIVE',
          { from: admin },
        )
        const contract = await GoodGhostingPolygonCurve.new(
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
          { from: admin },
        )
        const result = await contract.incentiveToken.call()
        assert(
          incentiveToken.address === result,
          'expected incentive token address to be set',
        )
      })
    })

    describe('when the time passes for a game', async () => {
      it('checks if the game segments increase', async () => {
        let result = -1
        for (
          let expectedSegment = 0;
          expectedSegment <= segmentCount;
          expectedSegment++
        ) {
          result = await goodGhosting.getCurrentSegment.call({ from: admin })
          assert(
            result.eq(new BN(expectedSegment)),
            `expected segment ${expectedSegment} actual ${result.toNumber()}`,
          )
          await timeMachine.advanceTimeAndBlock(weekInSecs)
        }
      })

      it('checks if the game completes when last segment completes', async () => {
        let result = -1
        let currentSegment = -1

        async function checksCompletion(expected, errorMsg) {
          currentSegment = await goodGhosting.getCurrentSegment.call({
            from: admin,
          })
          result = await goodGhosting.isGameCompleted.call({ from: admin })
          assert(result === expected, errorMsg)
        }

        for (let i = 0; i <= segmentCount; i++) {
          await checksCompletion(
            false,
            `game completed prior than expected; current segment: ${currentSegment}`,
          )
          await timeMachine.advanceTimeAndBlock(weekInSecs)
        }

        await checksCompletion(
          true,
          `game did not completed after last segment: ${currentSegment}`,
        )
      })
    })

    describe('when an user tries to join a game', async () => {
      it('reverts if the contract is paused', async () => {
        await goodGhosting.pause({ from: admin })
        await truffleAssert.reverts(
          goodGhosting.joinGame(0, { from: player1 }),
          'Pausable: paused',
        )
      })

      it('reverts if user does not approve the contract to spend dai', async () => {
        await truffleAssert.reverts(
          goodGhosting.joinGame(0, { from: player1 }),
          'You need to have allowance to do transfer DAI on the smart contract',
        )
      })

      it('reverts if the user tries to join after the first segment', async () => {
        await timeMachine.advanceTime(weekInSecs)
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.joinGame(0, { from: player1 }),
          'Game has already started',
        )
      })

      it('reverts if the user tries to join the game twice', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.joinGame(0, { from: player1 }),
          'Cannot join the game more than once',
        )
      })

      it('reverts if more players than maxPlayersCount try to join', async () => {
        contract = await GoodGhostingPolygonCurve.new(
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
          { from: admin },
        )
        await token.approve(contract.address, segmentPayment, { from: player1 })
        await contract.joinGame(0, { from: player1 })
        await token.approve(contract.address, segmentPayment, { from: player2 })
        await contract.joinGame(0, { from: player2 })
        await token.approve(contract.address, segmentPayment, {
          from: nonPlayer,
        })
        await truffleAssert.reverts(
          contract.joinGame(0, { from: nonPlayer, gas: 6000000 }),
          'Reached max quantity of players allowed',
        )
      })

      it('increases activePlayersCount when a new player joins', async () => {
        const playerCountBefore = await goodGhosting.activePlayersCount.call()
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        const playerCountAfter = await goodGhosting.activePlayersCount.call()
        assert(playerCountAfter.eq(playerCountBefore.add(new BN(1))))
      })

      it('second player can join after cap spot (maxPlayersCount) is open by an early withdraw', async () => {
        contract = await GoodGhostingPolygonCurve.new(
          token.address,
          pool.address,
          tokenPosition,
          poolType,
          gauge.address,
          segmentCount,
          segmentLength,
          segmentPayment,
          fee,
          0,
          1,
          curve.address,
          incentiveController.address,
          ZERO_ADDRESS,
          { from: admin },
        )
        await token.approve(contract.address, segmentPayment, { from: player1 })
        await contract.joinGame(0, { from: player1 })

        await token.approve(contract.address, segmentPayment, { from: player2 })
        await truffleAssert.reverts(
          contract.joinGame(0, { from: player2 }),
          'Reached max quantity of players allowed',
        )

        await contract.earlyWithdraw(0, { from: player1 })

        await token.approve(contract.address, segmentPayment, { from: player2 })
        await contract.joinGame(0, { from: player2 })

        await token.approve(contract.address, segmentPayment, {
          from: nonPlayer,
        })
        await truffleAssert.reverts(
          contract.joinGame(0, { from: nonPlayer }),
          'Reached max quantity of players allowed',
        )
      })

      it('early withdraw player can rejoin if spot (maxPlayersCount) is available', async () => {
        const contract = await GoodGhostingPolygonCurve.new(
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
          1,
          curve.address,
          incentiveController.address,
          ZERO_ADDRESS,
          { from: admin },
        )
        await token.approve(contract.address, segmentPayment, { from: player1 })
        await contract.joinGame(0, { from: player1 })

        await token.approve(contract.address, segmentPayment, { from: player2 })
        await truffleAssert.reverts(
          contract.joinGame(0, { from: player2 }),
          'Reached max quantity of players allowed',
        )

        await contract.earlyWithdraw(0, { from: player1 })

        await token.approve(contract.address, segmentPayment, { from: player1 })
        await contract.joinGame(0, { from: player1 })

        await token.approve(contract.address, segmentPayment, {
          from: nonPlayer,
        })
        await truffleAssert.reverts(
          contract.joinGame(0, { from: nonPlayer }),
          'Reached max quantity of players allowed',
        )
      })

      it('stores the player(s) who joined the game', async () => {
        // Player1 joins the game
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })

        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player2 })

        // Reads stored players and compares against player1 and player2
        // Remember: "iterablePlayers" is an array, so we need to pass the index we want to retrieve.
        const storedPlayer1 = await goodGhosting.iterablePlayers.call(0)
        const storedPlayer2 = await goodGhosting.iterablePlayers.call(1)
        assert(storedPlayer1 === player1)
        assert(storedPlayer2 === player2)

        // Checks player's info stored in the struct.
        const playerInfo1 = await goodGhosting.players(player1)
        assert(playerInfo1.mostRecentSegmentPaid.eq(new BN(0)))
        assert(playerInfo1.amountPaid.eq(segmentPayment))
        assert(playerInfo1.canRejoin === false)
        assert(playerInfo1.withdrawn === false)

        const playerInfo2 = await goodGhosting.players(player1)
        assert(playerInfo2.mostRecentSegmentPaid.eq(new BN(0)))
        assert(playerInfo2.amountPaid.eq(segmentPayment))
        assert(playerInfo2.canRejoin === false)
        assert(playerInfo2.withdrawn === false)
      })

      it('emits the event JoinedGame', async () => {
        await approveDaiToContract(player1)
        const result = await goodGhosting.joinGame(0, { from: player1 })
        let playerEvent = ''
        let paymentEvent = 0
        truffleAssert.eventEmitted(
          result,
          'JoinedGame',
          (ev) => {
            playerEvent = ev.player
            paymentEvent = ev.amount
            return (
              playerEvent === player1 &&
              new BN(paymentEvent).eq(new BN(segmentPayment))
            )
          },
          `JoinedGame event should be emitted when an user joins the game with params\n
                    player: expected ${player1}; got ${playerEvent}\n
                    paymentAmount: expected ${segmentPayment}; got ${paymentEvent}`,
        )
      })
    })

    describe('when a player tries to rejoin', async () => {
      it('reverts if user tries to rejoin the game after segment 0', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTime(weekInSecs)
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.joinGame(0, { from: player1 }),
          'Game has already started',
        )
      })

      it('reverts if a user tries to rejoin the game in segment 0 without doing an early withdraw', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.joinGame(0, { from: player1 }),
          'Cannot join the game more than once',
        )
      })

      it('user can rejoin the game on segment 0 after an early withdrawal', async () => {
        await approveDaiToContract(player1)
        const playerAllowance = await token.allowance(
          player1,
          goodGhosting.address,
        )
        assert(playerAllowance.gte(segmentPayment))
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
      })

      it('verifies the player info stored in the contract after user rejoins after an early withdraw', async () => {
        await approveDaiToContract(player1)
        const playerAllowance = await token.allowance(
          player1,
          goodGhosting.address,
        )
        assert(playerAllowance.gte(segmentPayment))
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        const playerInfo = await goodGhosting.players(player1)
        assert(playerInfo.mostRecentSegmentPaid.eq(new BN(0)))
        assert(playerInfo.amountPaid.eq(segmentPayment))
        assert(playerInfo.canRejoin === false)
        assert(playerInfo.withdrawn === false)
      })

      it('does not increase the number of players when a user rejoins the game on segment 0 after an early withdrawal', async () => {
        await approveDaiToContract(player1)
        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.joinGame(0, { from: player2 })
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        await approveDaiToContract(player1)
        const userDaiBalance = await token.balanceOf(player1)
        assert(userDaiBalance.gte(segmentPayment))
        await goodGhosting.joinGame(0, { from: player1 })
        const numPlayers = await goodGhosting.getNumberOfPlayers()
        assert(numPlayers.eq(new BN(2)))
      })
    })

    describe('when an user tries to make a deposit', async () => {
      it('reverts if the contract is paused', async () => {
        await goodGhosting.pause({ from: admin })
        await truffleAssert.reverts(
          goodGhosting.makeDeposit(0, { from: player1 }),
          'Pausable: paused',
        )
      })

      it("reverts if user didn't join the game", async () => {
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.makeDeposit(0, { from: player1 }),
          'Sender is not a player',
        )
      })

      it('reverts if user tries to deposit during segment 0', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.makeDeposit(0, { from: player1 }),
          'Deposit available only between segment 1 and segment n-1 (penultimate)',
        )
      })

      it('reverts if user is making a deposit during segment n (last segment)', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // Advances to last segment
        await timeMachine.advanceTime(weekInSecs * segmentCount)
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.makeDeposit(0, { from: player1 }),
          'Deposit available only between segment 1 and segment n-1 (penultimate)',
        )
      })

      it('reverts if user tries to deposit after the game ends', async () => {
        await joinGamePaySegmentsAndComplete(player1)
        await truffleAssert.reverts(
          goodGhosting.makeDeposit(0, { from: player1 }),
          ' Deposit available only between segment 1 and segment n-1 (penultimate)',
        )
      })

      it('reverts if user is making a duplicated deposit for the same segment', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // Moves to the next segment
        await timeMachine.advanceTime(weekInSecs)
        await approveDaiToContract(player1)
        await goodGhosting.makeDeposit(0, { from: player1 })
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.makeDeposit(0, { from: player1 }),
          'Player already paid current segment',
        )
      })

      it('reverts if user forgot to deposit for previous segment', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTime(weekInSecs * 2)
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.makeDeposit(0, { from: player1 }),
          "Player didn't pay the previous segment - game over!",
        )
      })

      it('user can deposit successfully if all requirements are met', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        await approveDaiToContract(player1)
        const result = await goodGhosting.makeDeposit(0, { from: player1 })
        truffleAssert.eventEmitted(
          result,
          'Deposit',
          (ev) => ev.player === player1,
          'player unable to deposit for segment 2 when all requirements were met',
        )
      })

      it('transfers the payment to the contract', async () => {
        const expectedBalance = web3.utils.toBN(segmentPayment * 2)
        await approveDaiToContract(player1)
        const playerAllowance = await token.allowance(
          player1,
          goodGhosting.address,
        )
        assert(playerAllowance.gte(segmentPayment))
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        await approveDaiToContract(player1)
        await goodGhosting.makeDeposit(0, { from: player1 })
        const contractsDaiBalance = await gauge.balanceOf(goodGhosting.address)
        // gauge balance is less that deposited amount
        assert(contractsDaiBalance.gt(new BN(0)))
        assert(
          expectedBalance.gt(contractsDaiBalance),
          'Contract balance should increase when user deposits',
        )
      })

      it('makes sure the total principal amount increases', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        await approveDaiToContract(player1)
        const principalBeforeDeposit = await goodGhosting.totalGamePrincipal()
        await goodGhosting.makeDeposit(0, { from: player1 })
        const principalAfterDeposit = await goodGhosting.totalGamePrincipal()
        const difference = principalAfterDeposit.sub(principalBeforeDeposit)
        assert(difference.eq(segmentPayment))
      })

      it('makes sure the player info stored in contract is updated', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        await approveDaiToContract(player1)
        await goodGhosting.makeDeposit(0, { from: player1 })
        const playerInfo = await goodGhosting.players(player1)
        assert(playerInfo.mostRecentSegmentPaid.eq(new BN(1)))
        assert(playerInfo.amountPaid.eq(segmentPayment.mul(new BN(2))))
        assert(playerInfo.canRejoin === false)
        assert(playerInfo.withdrawn === false)
      })

      it('makes sure that the winner array contains the player address that makes the last segment deposit', async () => {
        await joinGamePaySegmentsAndComplete(player1)
        const winner = await goodGhosting.winners(new BN(0))
        assert(winner === player1)
      })

      it("for a pool with 1 segment make sure that winner array get's populated", async () => {
        const incentiveToken = await ERC20Mintable.new(
          'INCENTIVE',
          'INCENTIVE',
          { from: admin },
        )
        goodGhosting = await GoodGhostingPolygonCurve.new(
          token.address,
          pool.address,
          tokenPosition,
          poolType,
          gauge.address,
          1,
          segmentLength,
          segmentPayment,
          fee,
          adminFee,
          maxPlayersCount,
          curve.address,
          incentiveController.address,
          incentiveToken.address,
          { from: admin },
        )
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        const playerInfo = await goodGhosting.players(player1)
        const winnerCount = await goodGhosting.winnerCount()
        const winner = await goodGhosting.winners(new BN(0))
        assert(winner === player1)
        assert(playerInfo.isWinner)
        assert(winnerCount.eq(new BN(1)))
      })
      it("makes sure the winnerIndex get's updated when 2 players complete the game", async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player2 })
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          await goodGhosting.makeDeposit(0, { from: player1 })
          await approveDaiToContract(player2)
          await goodGhosting.makeDeposit(0, { from: player2 })
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        const player2Info = await goodGhosting.players(player2)
        assert(player2Info.winnerIndex.eq(new BN(1)))
        await timeMachine.advanceTime(weekInSecs * 2)
      })
    })

    describe('when a user withdraws before the end of the game', async () => {
      it('reverts if the contract is paused', async () => {
        await goodGhosting.pause({ from: admin })
        await truffleAssert.reverts(
          goodGhosting.earlyWithdraw(0, { from: player1 }),
          'Pausable: paused',
        )
      })

      it('reverts if the game is completed', async () => {
        await advanceToEndOfGame()
        await truffleAssert.reverts(
          goodGhosting.earlyWithdraw(0, { from: player1 }),
          'Game is already completed',
        )
      })

      it('reverts if a non-player tries to withdraw', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await truffleAssert.reverts(
          goodGhosting.earlyWithdraw(0, { from: nonPlayer }),
          'Player does not exist',
        )
      })

      it('sets withdrawn flag to true after user withdraws before end of game', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        const player1Result = await goodGhosting.players.call(player1)
        assert(player1Result.withdrawn)
      })

      it('reverts if user tries to withdraw more than once', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        await truffleAssert.reverts(
          goodGhosting.earlyWithdraw(0, { from: player1 }),
          'Player has already withdrawn',
        )
      })

      it('withdraws user balance subtracted by early withdraw fee', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)

        // Expect Player1 to get back their deposit minus the early withdraw fee defined in the constructor.
        const player1PreWithdrawBalance = await token.balanceOf(player1)
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        const player1PostWithdrawBalance = await token.balanceOf(player1)
        const feeAmount = segmentPayment.mul(new BN(fee)).div(new BN(100)) // fee is set as an integer, so needs to be converted to a percentage
        assert(
          player1PostWithdrawBalance
            .sub(player1PreWithdrawBalance)
            .eq(segmentPayment.sub(feeAmount)),
        )
      })

      it('fee collected from early withdrawal is part of segment deposit so it should generate interest', async () => {
        await approveDaiToContract(player1)
        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.joinGame(0, { from: player2 })
        const principalAmountBeforeWithdraw = await goodGhosting.totalGamePrincipal()
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        const principalAmount = await goodGhosting.totalGamePrincipal()
        // the principal amount when deducted during an early withdraw does not include fees since the fee goes to admin if there are no winners or is admin fee % > 0
        // so we check since segment deposit funds do generate interest so we check that segment deposit should be more than the principal
        assert(principalAmountBeforeWithdraw.gt(principalAmount))
      })

      it('withdraws user balance subtracted by early withdraw fee when not enough withdrawable balance in the contract', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        // Expect Player1 to get back their deposit minus the early withdraw fee defined in the constructor.
        const player1PreWithdrawBalance = await token.balanceOf(player1)
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        const player1PostWithdrawBalance = await token.balanceOf(player1)
        const feeAmount = segmentPayment.mul(new BN(fee)).div(new BN(100)) // fee is set as an integer, so needs to be converted to a percentage
        assert(
          player1PostWithdrawBalance
            .sub(player1PreWithdrawBalance)
            .eq(segmentPayment.sub(feeAmount)),
        )
      })

      it('emits EarlyWithdrawal event when user withdraws before end of game', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        const result = await goodGhosting.earlyWithdraw(0, { from: player1 })
        truffleAssert.eventEmitted(
          result,
          'EarlyWithdrawal',
          (ev) => ev.player === player1,
          'player unable to withdraw in between the game',
        )
      })

      it('reverts if user tries to pay next segment after early withdraw', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        await timeMachine.advanceTimeAndBlock(weekInSecs)
        await approveDaiToContract(player1)
        await truffleAssert.reverts(
          goodGhosting.makeDeposit(0, { from: player1 }),
          'Player already withdraw from game',
        )
      })

      it('user is able to withdraw in the last segment', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          if (index === segmentCount - 1) {
            const result = await goodGhosting.earlyWithdraw(0, {
              from: player1,
            })
            truffleAssert.eventEmitted(
              result,
              'EarlyWithdrawal',
              (ev) => ev.player === player1,
              'player unable to withdraw in between the game',
            )
          } else {
            // protocol deposit of the prev. deposit
            await approveDaiToContract(player1)
            await goodGhosting.makeDeposit(0, { from: player1 })
          }
        }
      })

      it('user is able to withdraw in the last segment when 2 players join the game and one of them early withdraws when the segment amount is less than withdraw amount', async () => {
        await approveDaiToContract(player1)
        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.joinGame(0, { from: player2 })

        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          await goodGhosting.makeDeposit(0, { from: player1 })
          // protocol deposit of the prev. deposit
          await approveDaiToContract(player2)
          await goodGhosting.makeDeposit(0, { from: player2 })
        }
        const result = await goodGhosting.earlyWithdraw(0, { from: player1 })
        truffleAssert.eventEmitted(
          result,
          'EarlyWithdrawal',
          (ev) => ev.player === player1,
          'player unable to withdraw in between the game',
        )
      })

      it('winner count reduces when a potential winner withdraws after the last segment', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          await goodGhosting.makeDeposit(0, { from: player1 })
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs)
        const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount()
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        const winnerCountAfterEarlyWithdraw = await goodGhosting.winnerCount()
        assert(winnerCountBeforeEarlyWithdraw.eq(new BN(1)))
        assert(winnerCountAfterEarlyWithdraw.eq(new BN(0)))
      })

      it('winner address in the winner array changes to zero address when a potential winner withdraws after the last segment', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          await goodGhosting.makeDeposit(0, { from: player1 })
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs)
        const playerInfoBeforeWithdraw = await goodGhosting.players(player1)
        let winner = await goodGhosting.winners(
          playerInfoBeforeWithdraw.winnerIndex,
        )
        assert(winner == player1)
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        const playerInfoAfterWithdraw = await goodGhosting.players(player1)
        console.log()
        winner = await goodGhosting.winners(playerInfoAfterWithdraw.winnerIndex)
        assert(winner == ZERO_ADDRESS)
      })

      it('winner count reduces when a potential winner withdraws during the last segment after the deposit', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          if (index < segmentCount - 1) {
            await goodGhosting.makeDeposit(0, { from: player1 })
          } else {
            await goodGhosting.makeDeposit(0, { from: player1 })
            const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount()
            await goodGhosting.earlyWithdraw(0, { from: player1 })
            const winnerCountAfterEarlyWithdraw = await goodGhosting.winnerCount()
            assert(winnerCountBeforeEarlyWithdraw.eq(new BN(1)))
            assert(winnerCountAfterEarlyWithdraw.eq(new BN(0)))
          }
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs * 2)
      })

      it('winner flag changes to false when a potential winner withdraws during the last segment after the deposit', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          if (index < segmentCount - 1) {
            await goodGhosting.makeDeposit(0, { from: player1 })
          } else {
            await goodGhosting.makeDeposit(0, { from: player1 })
            const playerInfoBeforeWithdraw = await goodGhosting.players(player1)
            await goodGhosting.earlyWithdraw(0, { from: player1 })
            const playerInfoAfterWithdraw = await goodGhosting.players(player1)
            assert(playerInfoBeforeWithdraw.isWinner)
            assert(!playerInfoAfterWithdraw.isWinner)
          }
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs * 2)
      })

      it('winner count does not reduces when a non-winner withdraws during the last deposit segment', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          if (index < segmentCount - 1) {
            await goodGhosting.makeDeposit(0, { from: player1 })
          }
          if (index == segmentCount - 1) {
            const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount()
            await goodGhosting.earlyWithdraw(0, { from: player1 })
            const winnerCountAfterEarlyWithdraw = await goodGhosting.winnerCount()
            assert(
              winnerCountBeforeEarlyWithdraw.eq(winnerCountAfterEarlyWithdraw),
            )
          }
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs * 2)
      })

      it('winner count does not reduces when a non-winner withdraws before the last deposit segment', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await timeMachine.advanceTime(weekInSecs)
        await approveDaiToContract(player1)
        const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount()
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        const winnerCountAfterEarlyWithdraw = await goodGhosting.winnerCount()
        assert(winnerCountBeforeEarlyWithdraw.eq(winnerCountAfterEarlyWithdraw))
      })

      it('winner count does not reduces when a non-winner withdraws after the last deposit segment', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        // The payment for the first segment was done upon joining, so we start counting from segment 2 (index 1)
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
        }
        const winnerCountBeforeEarlyWithdraw = await goodGhosting.winnerCount()
        await goodGhosting.earlyWithdraw(0, { from: player1 })
        const winnerCountAfterEarlyWithdraw = await goodGhosting.winnerCount()
        assert(winnerCountBeforeEarlyWithdraw.eq(winnerCountAfterEarlyWithdraw))
      })

      it('when a player tries to earlyWithdraw and the contract balance from removing liquidity is less than the withdraw amount', async () => {
        const incentiveToken = await ERC20Mintable.new(
          'INCENTIVE',
          'INCENTIVE',
          { from: admin },
        )
        const instance = await GoodGhostingPolygonCurve.new(
          token.address,
          pool.address,
          tokenPosition,
          poolType,
          gauge.address,
          1,
          segmentLength,
          '1000000000000000000',
          fee,
          adminFee,
          maxPlayersCount,
          curve.address,
          incentiveController.address,
          incentiveToken.address,
          { from: admin },
        )
        await token.approve(instance.address, '1000000000000000000', {
          from: player1,
        })
        await instance.joinGame(0, { from: player1 })
        const withdrawalAmount = new BN('1000000000000000000').sub(
          new BN('1000000000000000000').div(new BN(10)),
        )
        const preWithdrawBalance = await token.balanceOf(player1)
        await instance.earlyWithdraw('800000000000000000', { from: player1 })
        const postWithdrawBalance = await token.balanceOf(player1)
        // amount received is less due to pool imbalance
        assert(postWithdrawBalance.sub(preWithdrawBalance).lt(withdrawalAmount))
      })
    })

    describe('when an user tries to redeem from the external pool', async () => {
      it('transfer funds to contract then redeems from external pool', async () => {
        await joinGamePaySegmentsAndComplete(player1)
        let contractMaticBalanceBeforeRedeem = await incentiveController.balanceOf(
          goodGhosting.address,
        )
        let contractCurveBalanceBeforeRedeem = await curve.balanceOf(
          goodGhosting.address,
        )

        await goodGhosting.redeemFromExternalPool(0, { from: player2 })
        let contractMaticBalanceAfterRedeem = await incentiveController.balanceOf(
          goodGhosting.address,
        )
        let contractCurveBalanceAfterRedeem = await curve.balanceOf(
          goodGhosting.address,
        )
        assert(
          contractMaticBalanceAfterRedeem.gt(contractMaticBalanceBeforeRedeem),
        )
        assert(
          contractCurveBalanceAfterRedeem.gt(contractCurveBalanceBeforeRedeem),
        )
      })

      it('emits event FundsRedeemedFromExternalPool when redeem is successful', async () => {
        await joinGamePaySegmentsAndComplete(player1)
        let contractCurveBalanceBeforeRedeem = await curve.balanceOf(
          goodGhosting.address,
        )
        const result = await goodGhosting.redeemFromExternalPool(0, {
          from: player1,
        })
        let contractCurveBalanceAfterRedeem = await curve.balanceOf(
          goodGhosting.address,
        )
        assert(
          contractCurveBalanceAfterRedeem.gt(contractCurveBalanceBeforeRedeem),
        )
        const contractCurveBalance = await curve.balanceOf(goodGhosting.address)
        truffleAssert.eventEmitted(
          result,
          'FundsRedeemedFromExternalPool',
          (ev) => new BN(ev.curveRewards).eq(new BN(contractCurveBalance)),
          'FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool',
        )
      })

      it('allocates external rewards sent to contract to the players', async () => {
        const incentiveRewards = new BN(toWad(1000))
        const contractMaticBalanceBeforeIncentive = await incentiveController.balanceOf(
          goodGhosting.address,
        )
        await mintRewardsFor(goodGhosting.address)
        const contractMaticBalanceAfterIncentive = await incentiveController.balanceOf(
          goodGhosting.address,
        )
        assert(
          contractMaticBalanceAfterIncentive.eq(
            incentiveRewards.add(contractMaticBalanceBeforeIncentive),
          ),
          'contract rewards balance after incentive does not match',
        )

        await joinGamePaySegmentsAndComplete(player1)
        const result = await goodGhosting.redeemFromExternalPool(0, {
          from: player1,
        })
        const rewardsPerPlayer = new BN(
          await goodGhosting.rewardsPerPlayer.call({ from: admin }),
        )

        let contractMaticBalanceAfterRedeem = await incentiveController.balanceOf(
          goodGhosting.address,
        )
        const contractDaiBalance = await token.balanceOf(goodGhosting.address)
        const expectedRewardAmount = contractMaticBalanceAfterRedeem.sub(
          contractMaticBalanceBeforeIncentive,
        )

        assert(
          contractMaticBalanceAfterRedeem.gt(
            contractMaticBalanceAfterIncentive,
          ),
        )
        assert(
          expectedRewardAmount.eq(rewardsPerPlayer),
          'rewardsPerPlayer does not match',
        )
        truffleAssert.eventEmitted(
          result,
          'FundsRedeemedFromExternalPool',
          (ev) =>
            new BN(ev.totalAmount).eq(new BN(contractDaiBalance)) &&
            new BN(ev.rewards).eq(new BN(expectedRewardAmount)),
          'FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool',
        )
      })

      it('originalTotalGamePrincipal is calculated correctly in case of impermanentLoss', async () => {
        await joinGamePaySegmentsAndComplete(player1)
        // to trigger impermanent loss
        await goodGhosting.redeemFromExternalPool('900000000000000000', {
          from: player2,
        })
        const principalAmount = await goodGhosting.totalGamePrincipal()
        const originalTotalGamePrincipal = await goodGhosting.originalTotalGamePrincipal()

        assert(originalTotalGamePrincipal.gt(principalAmount))
      })

      it('we are able to redeem if there is impermanent loss', async () => {
        await joinGamePaySegmentsAndComplete(player1)
        // to trigger impermanent loss
        const principalAmount = await goodGhosting.totalGamePrincipal()
        await goodGhosting.redeemFromExternalPool('900000000000000000', {
          from: player2,
        })
        const contractDaiBalance = await token.balanceOf(goodGhosting.address)

        const calculatedImpermanentLossShare = new BN(contractDaiBalance)
          .mul(new BN(100))
          .div(new BN(principalAmount))
        const impermanentLossShareFromContract = await goodGhosting.impermanentLossShare()

        assert(
          impermanentLossShareFromContract.eq(calculatedImpermanentLossShare),
        )
      })

      context('when incentive token is defined', async () => {
        const approvalAmount = segmentPayment
          .mul(new BN(segmentCount))
          .toString()
        const incentiveAmount = new BN(toWad(10))
        let contract
        let incentiveToken

        beforeEach(async () => {
          incentiveToken = await ERC20Mintable.new('INCENTIVE', 'INCENTIVE', {
            from: admin,
          })
          contract = await GoodGhostingPolygonCurve.new(
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
            { from: admin },
          )
        })

        it('sets totalIncentiveAmount to amount sent to contract', async () => {
          await incentiveToken.mint(
            contract.address,
            incentiveAmount.toString(),
            { from: admin },
          )
          await token.approve(contract.address, approvalAmount, {
            from: player1,
          })
          await joinGamePaySegmentsAndComplete(player1, contract)
          await contract.redeemFromExternalPool(0, { from: player1 })
          const result = new BN(await contract.totalIncentiveAmount.call())
          assert(
            result.eq(incentiveAmount),
            `totalIncentiveAmount should be ${incentiveAmount.toString()}; received ${result.toString()}`,
          )
        })

        it('sets totalIncentiveAmount to zero if no amount is sent to contract', async () => {
          await token.approve(contract.address, approvalAmount, {
            from: player1,
          })
          await joinGamePaySegmentsAndComplete(player1, contract)
          await contract.redeemFromExternalPool(0, { from: player1 })
          const result = new BN(await contract.totalIncentiveAmount.call())
          assert(
            result.eq(new BN(0)),
            `totalIncentiveAmount should be 0; received ${result.toString()}`,
          )
        })
      })
    })

    describe('when no one wins the game', async () => {
      it('transfers interest to the owner in case no one wins', async () => {
        // having test with only 1 player for now
        await joinGameMissLastPaymentAndComplete(player1)
        const result = await goodGhosting.redeemFromExternalPool(0, {
          from: player1,
        })
        const adminBalance = await token.balanceOf(admin)
        const principalBalance = await token.balanceOf(goodGhosting.address)
        truffleAssert.eventEmitted(
          result,
          'FundsRedeemedFromExternalPool',
          (ev) =>
            new BN(ev.totalGameInterest).eq(new BN(adminBalance)) &&
            new BN(ev.totalGamePrincipal).eq(new BN(principalBalance)) &&
            new BN(ev.rewards / 10 ** 18).eq(new BN(1000)),
          'FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool',
        )
      })

      it('transfers principal to the user in case no one wins', async () => {
        const incompleteSegment = segmentCount - 1
        const amountPaidInGame = web3.utils.toBN(
          segmentPayment * incompleteSegment,
        )
        await joinGameMissLastPaymentAndComplete(player1)
        await goodGhosting.redeemFromExternalPool(0, { from: player1 })
        const result = await goodGhosting.withdraw(0, { from: player1 })

        truffleAssert.eventEmitted(
          result,
          'Withdrawal',
          (ev) =>
            ev.player === player1 &&
            web3.utils.toBN(ev.amount).eq(amountPaidInGame),
          'Withdrawal event should be emitted when user tries to withdraw their principal',
        )
      })
    })

    describe('when an user tries to withdraw', async () => {
      it('reverts if user tries to withdraw more than once', async () => {
        await joinGamePaySegmentsAndComplete(player1)
        await goodGhosting.redeemFromExternalPool(0, { from: player1 })
        await goodGhosting.withdraw(0, { from: player1 })
        await truffleAssert.reverts(
          goodGhosting.withdraw(0, { from: player1 }),
          'Player has already withdrawn',
        )
      })

      it('reverts if a non-player tries to withdraw', async () => {
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })
        await truffleAssert.reverts(
          goodGhosting.earlyWithdraw(0, { from: nonPlayer }),
          'Player does not exist',
        )
      })

      it('sets withdrawn flag to true after user withdraws', async () => {
        await joinGamePaySegmentsAndComplete(player1)
        await goodGhosting.redeemFromExternalPool(0, { from: player1 })
        await goodGhosting.withdraw(0, { from: player1 })
        const player1Result = await goodGhosting.players.call(player1)
        assert(player1Result.withdrawn)
      })

      it('player is able to withdraw if there is impermanent loss', async () => {
        await approveDaiToContract(player1)
        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.joinGame(0, { from: player2 })
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          await approveDaiToContract(player2)

          await goodGhosting.makeDeposit(0, { from: player1 })
          await goodGhosting.makeDeposit(0, { from: player2 })
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs)
        await timeMachine.advanceTime(weekInSecs)
        await goodGhosting.redeemFromExternalPool('900000000000000000', {
          from: player1,
        })
        // 6 => qty
        const newPrincipal = 6000000000000000000

        const impermanentLossShareFromContract = await goodGhosting.impermanentLossShare()
        const player1BeforeWithdrawBalance = await token.balanceOf(player1)
        const player1Info = await goodGhosting.players(player1)

        const player2BeforeWithdrawBalance = await token.balanceOf(player2)
        const player2Info = await goodGhosting.players(player2)

        await goodGhosting.withdraw(0, { from: player1 })
        await goodGhosting.withdraw(0, { from: player2 })

        const player1AfterWithdrawBalance = await token.balanceOf(player1)
        const player2AfterWithdrawBalance = await token.balanceOf(player2)

        const player1Difference = player1AfterWithdrawBalance.sub(
          player1BeforeWithdrawBalance,
        )
        const actualAmountReceivedByPlayer1 = player1Info.amountPaid
          .mul(impermanentLossShareFromContract)
          .div(new BN(100))

        const player2Difference = player2AfterWithdrawBalance.sub(
          player2BeforeWithdrawBalance,
        )
        const actualAmountReceivedByPlayer2 = player2Info.amountPaid
          .mul(impermanentLossShareFromContract)
          .div(new BN(100))

        assert(player1Difference.eq(actualAmountReceivedByPlayer1))
        assert(player2Difference.eq(actualAmountReceivedByPlayer2))

        assert(player1Difference.toString() === (newPrincipal / 2).toString())
        assert(player2Difference.toString() === (newPrincipal / 2).toString())
      })

      it('ghosts are able to withdraw on impermanent loss', async () => {
        await approveDaiToContract(player1)
        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.joinGame(0, { from: player2 })
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)

          await goodGhosting.makeDeposit(0, { from: player1 })
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs)
        await timeMachine.advanceTime(weekInSecs)
        await goodGhosting.redeemFromExternalPool('900000000000000000', {
          from: player1,
        })

        const impermanentLossShareFromContract = await goodGhosting.impermanentLossShare()

        const player1BeforeWithdrawBalance = await token.balanceOf(player1)
        const player1Info = await goodGhosting.players(player1)

        const player2BeforeWithdrawBalance = await token.balanceOf(player2)
        const player2Info = await goodGhosting.players(player2)

        await goodGhosting.withdraw(0, { from: player1 })
        await goodGhosting.withdraw(0, { from: player2 })

        const player1AfterWithdrawBalance = await token.balanceOf(player1)
        const player2AfterWithdrawBalance = await token.balanceOf(player2)

        const player1Difference = player1AfterWithdrawBalance.sub(
          player1BeforeWithdrawBalance,
        )
        const actualAmountReceivedByPlayer1 = player1Info.amountPaid
          .mul(impermanentLossShareFromContract)
          .div(new BN(100))

        const player2Difference = player2AfterWithdrawBalance.sub(
          player2BeforeWithdrawBalance,
        )
        const actualAmountReceivedByPlayer2 = player2Info.amountPaid
          .mul(impermanentLossShareFromContract)
          .div(new BN(100))

        assert(player1Difference.eq(actualAmountReceivedByPlayer1))
        assert(player2Difference.eq(actualAmountReceivedByPlayer2))
      })

      it("withdraws from external pool on first withdraw if funds weren't redeemed yet", async () => {
        const expectedAmount = web3.utils.toBN(segmentPayment * segmentCount)
        await joinGamePaySegmentsAndComplete(player1)
        const result = await goodGhosting.withdraw(0, { from: player1 })
        truffleAssert.eventEmitted(
          result,
          'FundsRedeemedFromExternalPool',
          (ev) => web3.utils.toBN(ev.totalAmount).eq(expectedAmount),
          'FundsRedeemedFromExternalPool event should be emitted when funds are redeemed from external pool',
        )
      })

      it('makes sure the player that withdraws first before funds are redeemed from external pool gets equal interest (if winner)', async () => {
        await approveDaiToContract(player1)
        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.joinGame(0, { from: player2 })
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          await approveDaiToContract(player2)
          await goodGhosting.makeDeposit(0, { from: player1 })
          await goodGhosting.makeDeposit(0, { from: player2 })
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs)
        await timeMachine.advanceTime(weekInSecs)
        await mintTokensFor(admin)
        const incentiveAmount = toWad(1000)

        await token.approve(pool.address, ethers.utils.parseEther('1000'), {
          from: admin,
        })
        await pool.add_liquidity(
          [ethers.utils.parseEther('1000'), '0', '0'],
          0,
          true,
          { from: admin },
        )
        await pool.transfer(
          goodGhosting.address,
          ethers.utils.parseEther('1000'),
          { from: admin },
        )

        const player1BeforeWithdrawBalance = await token.balanceOf(player1)
        await goodGhosting.withdraw(0, { from: player1 })
        const player1PostWithdrawBalance = await token.balanceOf(player1)
        const player1WithdrawAmount = player1PostWithdrawBalance.sub(
          player1BeforeWithdrawBalance,
        )

        const player2BeforeWithdrawBalance = await token.balanceOf(player2)
        await goodGhosting.withdraw(0, { from: player2 })
        const player2PostWithdrawBalance = await token.balanceOf(player2)
        const player2WithdrawAmount = player2PostWithdrawBalance.sub(
          player2BeforeWithdrawBalance,
        )

        const paidAmount = new BN(segmentCount).mul(new BN(segmentPayment))
        const adminFeeAmount = incentiveAmount
          .mul(new BN(adminFee))
          .div(new BN(100))
        const playerInterest = new BN(incentiveAmount.sub(adminFeeAmount)).div(
          new BN(2),
        ) // 2 players in the game
        const expectedWithdrawalAmount = paidAmount.add(playerInterest)

        // both players are winners, so should withdraw the same amount.
        assert(player1WithdrawAmount.eq(player2WithdrawAmount))

        // amount withdrawn, should match expectedWithdrawalAmount
        assert(expectedWithdrawalAmount.eq(player1WithdrawAmount))
      })

      it('makes sure the winners get equal interest', async () => {
        await approveDaiToContract(player1)
        await approveDaiToContract(player2)
        await goodGhosting.joinGame(0, { from: player1 })
        await goodGhosting.joinGame(0, { from: player2 })
        for (let index = 1; index < segmentCount; index++) {
          await timeMachine.advanceTime(weekInSecs)
          await approveDaiToContract(player1)
          await approveDaiToContract(player2)

          await goodGhosting.makeDeposit(0, { from: player1 })
          await goodGhosting.makeDeposit(0, { from: player2 })
        }
        // above, it accounted for 1st deposit window, and then the loop runs till segmentCount - 1.
        // now, we move 2 more segments (segmentCount-1 and segmentCount) to complete the game.
        await timeMachine.advanceTime(weekInSecs)
        await timeMachine.advanceTime(weekInSecs)
        await mintTokensFor(admin)
        await token.approve(pool.address, ethers.utils.parseEther('1000'), {
          from: admin,
        })
        await pool.add_liquidity(
          [ethers.utils.parseEther('1000'), '0', '0'],
          0,
          true,
          { from: admin },
        )
        await pool.transfer(
          goodGhosting.address,
          ethers.utils.parseEther('1000'),
          { from: admin },
        )
        await goodGhosting.redeemFromExternalPool(0, { from: admin })

        await goodGhosting.withdraw(0, { from: player1 })
        const player1PostWithdrawBalance = await token.balanceOf(player1)

        await goodGhosting.withdraw(0, { from: player2 })
        const player2PostWithdrawBalance = await token.balanceOf(player2)
        assert(player2PostWithdrawBalance.eq(player1PostWithdrawBalance))
      })

      it('pays a bonus to winners and losers get their principle back', async () => {
        // Player1 is out "loser" and their interest is Player2's bonus
        await approveDaiToContract(player1)
        await goodGhosting.joinGame(0, { from: player1 })

        // Player2 pays in all segments and is our lucky winner!
        await mintTokensFor(player2)
        await joinGamePaySegmentsAndComplete(player2)

        // Simulate some interest by giving the contract more aDAI
        await mintTokensFor(admin)
        await token.approve(pool.address, ethers.utils.parseEther('1000'), {
          from: admin,
        })
        await pool.add_liquidity(
          [ethers.utils.parseEther('1000'), '0', '0'],
          0,
          true,
          { from: admin },
        )
        await pool.transfer(
          goodGhosting.address,
          ethers.utils.parseEther('1000'),
          { from: admin },
        )

        // Expect Player1 to get back the deposited amount
        const player1PreWithdrawBalance = await token.balanceOf(player1)
        let playerMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(
          player1,
        )

        await goodGhosting.withdraw(0, { from: player1 })
        let playerMaticBalanceAfterWithdraw = await incentiveController.balanceOf(
          player1,
        )
        assert(
          playerMaticBalanceAfterWithdraw.eq(playerMaticBalanceBeforeWithdraw),
        )
        const player1PostWithdrawBalance = await token.balanceOf(player1)
        assert(
          player1PostWithdrawBalance
            .sub(player1PreWithdrawBalance)
            .eq(segmentPayment),
        )

        // Expect Player2 to get an amount greater than the sum of all the deposits
        const player2PreWithdrawBalance = await token.balanceOf(player2)
        playerMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(
          player2,
        )

        await goodGhosting.withdraw(0, { from: player2 })
        playerMaticBalanceAfterWithdraw = await incentiveController.balanceOf(
          player2,
        )
        assert(
          playerMaticBalanceAfterWithdraw.gt(playerMaticBalanceBeforeWithdraw),
        )

        const player2PostWithdrawBalance = await token.balanceOf(player2)
        const totalGameInterest = await goodGhosting.totalGameInterest.call()
        const adminFeeAmount = new BN(adminFee)
          .mul(totalGameInterest)
          .div(new BN('100'))
        const withdrawalValue = player2PostWithdrawBalance.sub(
          player2PreWithdrawBalance,
        )

        const userDeposit = segmentPayment.mul(web3.utils.toBN(segmentCount))
        // taking in account the pool fees 5%
        assert(
          withdrawalValue.lte(userDeposit.add(toWad(1000)).sub(adminFeeAmount)),
        )
      })

      it('emits Withdrawal event when user withdraws', async () => {
        // having test with only 1 player for now
        await joinGamePaySegmentsAndComplete(player1)
        let contractMaticBalanceBeforeRedeem = await incentiveController.balanceOf(
          goodGhosting.address,
        )
        let contractCurveBalanceBeforeRedeem = await curve.balanceOf(
          goodGhosting.address,
        )

        await goodGhosting.redeemFromExternalPool(0, { from: admin })

        let contractMaticBalanceAfterRedeem = await incentiveController.balanceOf(
          goodGhosting.address,
        )
        let contractCurveBalanceAfterRedeem = await curve.balanceOf(
          goodGhosting.address,
        )
        assert(
          contractMaticBalanceAfterRedeem.gt(contractMaticBalanceBeforeRedeem),
        )
        assert(
          contractCurveBalanceAfterRedeem.gt(contractCurveBalanceBeforeRedeem),
        )

        const result = await goodGhosting.withdraw(0, { from: player1 })
        truffleAssert.eventEmitted(
          result,
          'Withdrawal',
          (ev) => {
            return (
              ev.player === player1 &&
              new BN(ev.playerReward / 10 ** 18).eq(new BN(1000))
            )
          },
          'unable to withdraw amount',
        )
      })

      context('when incentive token is defined', async () => {
        const approvalAmount = segmentPayment
          .mul(new BN(segmentCount))
          .toString()
        const incentiveAmount = new BN(toWad(10))
        const rewardAmount = new BN(toWad(1000))
        let contract
        let incentiveToken

        beforeEach(async () => {
          incentiveToken = await ERC20Mintable.new('INCENTIVE', 'INCENTIVE', {
            from: admin,
          })
          contract = await GoodGhostingPolygonCurve.new(
            token.address,
            pool.address,
            tokenPosition,
            poolType,
            gauge.address,
            segmentCount,
            segmentLength,
            segmentPayment,
            fee,
            0,
            maxPlayersCount,
            curve.address,
            incentiveController.address,
            incentiveToken.address,
            { from: admin },
          )
        })

        it('pays additional incentive to winners when incentive is sent to contract', async () => {
          await incentiveToken.mint(
            contract.address,
            incentiveAmount.toString(),
            { from: admin },
          )
          await token.approve(contract.address, approvalAmount, {
            from: player1,
          })
          await token.approve(contract.address, approvalAmount, {
            from: player2,
          })

          const player1IncentiveBalanceBefore = await incentiveToken.balanceOf(
            player1,
          )
          const player2IncentiveBalanceBefore = await incentiveToken.balanceOf(
            player2,
          )
          await contract.joinGame(0, { from: player2 })
          await joinGamePaySegmentsAndComplete(player1, contract)
          await contract.redeemFromExternalPool(0, { from: player1 })

          const resultPlayer2 = await contract.withdraw(0, { from: player2 })
          const resultPlayer1 = await contract.withdraw(0, { from: player1 })

          const player1IncentiveBalanceAfter = await incentiveToken.balanceOf(
            player1,
          )
          const player2IncentiveBalanceAfter = await incentiveToken.balanceOf(
            player2,
          )

          assert(
            player2IncentiveBalanceBefore.eq(player2IncentiveBalanceAfter),
            'player2 incentive token balance should be equal before and after withdrawal',
          )
          assert(
            player1IncentiveBalanceAfter.eq(
              player1IncentiveBalanceBefore.add(incentiveAmount),
            ),
            'player1 incentive balance should be equal to incentive sent',
          )

          truffleAssert.eventEmitted(
            resultPlayer2,
            'Withdrawal',
            (ev) => {
              return (
                ev.player === player2 &&
                new BN(ev.playerReward).eq(new BN(0)) &&
                new BN(ev.playerIncentive).eq(new BN(0))
              )
            },
            'invalid withdraw amounts for player 2',
          )

          truffleAssert.eventEmitted(
            resultPlayer1,
            'Withdrawal',
            (ev) => {
              return (
                ev.player === player1 &&
                new BN(ev.playerReward).eq(rewardAmount) &&
                new BN(ev.playerIncentive).eq(incentiveAmount)
              )
            },
            'invalid withdraw amounts for player 1',
          )
        })

        it('does not pay additional incentive to winners if incentive is not sent to contract', async () => {
          await token.approve(contract.address, approvalAmount, {
            from: player1,
          })
          await token.approve(contract.address, approvalAmount, {
            from: player2,
          })

          const player1IncentiveBalanceBefore = await incentiveToken.balanceOf(
            player1,
          )
          const player2IncentiveBalanceBefore = await incentiveToken.balanceOf(
            player2,
          )
          await contract.joinGame(0, { from: player2 })
          await joinGamePaySegmentsAndComplete(player1, contract)
          await contract.redeemFromExternalPool(0, { from: player1 })

          const resultPlayer2 = await contract.withdraw(0, { from: player2 })
          const resultPlayer1 = await contract.withdraw(0, { from: player1 })

          const player1IncentiveBalanceAfter = await incentiveToken.balanceOf(
            player1,
          )
          const player2IncentiveBalanceAfter = await incentiveToken.balanceOf(
            player2,
          )

          assert(
            player2IncentiveBalanceBefore.eq(player2IncentiveBalanceAfter),
            'player2 incentive token balance should be equal before and after withdrawal',
          )
          assert(
            player1IncentiveBalanceBefore.eq(player1IncentiveBalanceAfter),
            'player1 incentive token balance should be equal before and after withdrawal',
          )

          truffleAssert.eventEmitted(
            resultPlayer2,
            'Withdrawal',
            (ev) => {
              return (
                ev.player === player2 &&
                new BN(ev.playerReward).eq(new BN(0)) &&
                new BN(ev.playerIncentive).eq(new BN(0))
              )
            },
            'invalid withdraw amounts for player 2',
          )

          truffleAssert.eventEmitted(
            resultPlayer1,
            'Withdrawal',
            (ev) => {
              return (
                ev.player === player1 &&
                new BN(ev.playerReward).eq(rewardAmount) &&
                new BN(ev.playerIncentive).eq(new BN(0))
              )
            },
            'invalid withdraw amounts for player 1',
          )
        })
      })
    })

    describe('admin tries to withdraw fees with admin percentage fee greater than 0', async () => {
      context('reverts', async () => {
        it('when funds were not redeemed from external pool', async () => {
          await joinGamePaySegmentsAndComplete(player1)
          await truffleAssert.reverts(
            goodGhosting.adminFeeWithdraw({ from: admin }),
            'Funds not redeemed from external pool',
          )
        })

        it('when admin tries to withdraw fees again', async () => {
          await joinGamePaySegmentsAndComplete(player1)
          //generating mock interest
          await mintTokensFor(admin)
          await token.approve(pool.address, ethers.utils.parseEther('1000'), {
            from: admin,
          })
          await pool.add_liquidity(
            [ethers.utils.parseEther('1000'), '0', '0'],
            0,
            true,
            { from: admin },
          )
          await pool.transfer(
            goodGhosting.address,
            ethers.utils.parseEther('1000'),
            { from: admin },
          )
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })
          await goodGhosting.adminFeeWithdraw({ from: admin })
          await truffleAssert.reverts(
            goodGhosting.adminFeeWithdraw({ from: admin }),
            'Admin has already withdrawn',
          )
        })
      })

      context('with no winners in the game', async () => {
        it('does not revert when there is no interest generated (neither external interest nor early withdrawal fees)', async () => {
          await approveDaiToContract(player1)
          await goodGhosting.joinGame(0, { from: player1 })
          await advanceToEndOfGame()
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })
          const ZERO = new BN(0)
          const result = await goodGhosting.adminFeeWithdraw({ from: admin })
          truffleAssert.eventEmitted(
            result,
            'AdminWithdrawal',
            (ev) => ev.totalGameInterest.eq(ZERO) && ev.adminFeeAmount.eq(ZERO),
          )
        })

        it("withdraw fees when there's only early withdrawal fees", async () => {
          await approveDaiToContract(player1)
          await approveDaiToContract(player2)
          await goodGhosting.joinGame(0, { from: player1 })
          await goodGhosting.joinGame(0, { from: player2 })
          await timeMachine.advanceTimeAndBlock(weekInSecs)
          await goodGhosting.earlyWithdraw(0, { from: player1 })
          await advanceToEndOfGame()
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })
          const contractBalance = await token.balanceOf(goodGhosting.address)
          const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call()
          const grossInterest = contractBalance.sub(totalGamePrincipal)
          const regularAdminFee = grossInterest
            .mul(new BN(adminFee))
            .div(new BN(100))
          const gameInterest = await goodGhosting.totalGameInterest.call()
          // There's no winner, so admin takes it all
          const expectedAdminFee = regularAdminFee.add(gameInterest)
          let adminMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(
            admin,
          )

          const result = await goodGhosting.adminFeeWithdraw({ from: admin })
          let adminMaticBalanceAfterWithdraw = await incentiveController.balanceOf(
            admin,
          )
          // no external deposits
          // the mock contract sends matic and curve rewards even if there is 1 deposit
          assert(
            adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw),
          )
          truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) => {
            return (
              ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee)) &&
              ev.adminFeeAmount.eq(expectedAdminFee)
            )
          })
        })

        it("withdraw fees when there's only interest generated by external pool", async () => {
          await approveDaiToContract(player1)
          await approveDaiToContract(player2)
          await goodGhosting.joinGame(0, { from: player1 })
          await goodGhosting.joinGame(0, { from: player2 })
          // mocks interest generation
          await mintTokensFor(admin)
          await token.approve(pool.address, ethers.utils.parseEther('1000'), {
            from: admin,
          })
          await pool.add_liquidity(
            [ethers.utils.parseEther('1000'), '0', '0'],
            0,
            true,
            { from: admin },
          )
          await pool.transfer(
            goodGhosting.address,
            ethers.utils.parseEther('1000'),
            { from: admin },
          )
          await advanceToEndOfGame()
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })
          const contractBalance = await token.balanceOf(goodGhosting.address)
          const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call()
          const grossInterest = contractBalance.sub(totalGamePrincipal)
          const regularAdminFee = grossInterest
            .mul(new BN(adminFee))
            .div(new BN(100))
          const gameInterest = await goodGhosting.totalGameInterest.call()
          // There's no winner, so admin takes it all
          const expectedAdminFee = regularAdminFee.add(gameInterest)
          let adminMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(
            admin,
          )

          const result = await goodGhosting.adminFeeWithdraw({ from: admin })
          let adminMaticBalanceAfterWithdraw = await incentiveController.balanceOf(
            admin,
          )
          assert(
            adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw),
          )
          truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) => {
            return (
              ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee)) &&
              ev.adminFeeAmount.eq(expectedAdminFee)
            )
          })
        })

        it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
          await approveDaiToContract(player1)
          await approveDaiToContract(player2)
          await goodGhosting.joinGame(0, { from: player1 })
          await goodGhosting.joinGame(0, { from: player2 })
          await goodGhosting.earlyWithdraw(0, { from: player1 })
          await mintTokensFor(admin)
          await token.approve(pool.address, ethers.utils.parseEther('1000'), {
            from: admin,
          })
          await pool.add_liquidity(
            [ethers.utils.parseEther('1000'), '0', '0'],
            0,
            true,
            { from: admin },
          )
          await pool.transfer(
            goodGhosting.address,
            ethers.utils.parseEther('1000'),
            { from: admin },
          )
          await timeMachine.advanceTimeAndBlock(weekInSecs)
          await advanceToEndOfGame()
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })
          const contractBalance = await token.balanceOf(goodGhosting.address)
          const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call()
          const grossInterest = contractBalance.sub(totalGamePrincipal)
          const regularAdminFee = grossInterest
            .mul(new BN(adminFee))
            .div(new BN(100))
          const gameInterest = await goodGhosting.totalGameInterest.call()
          // There's no winner, so admin takes it all
          const expectedAdminFee = regularAdminFee.add(gameInterest)
          const adminMaticBalanceBeforeWithdraw = await incentiveController.balanceOf(
            admin,
          )
          const result = await goodGhosting.adminFeeWithdraw({ from: admin })
          const adminMaticBalanceAfterWithdraw = await incentiveController.balanceOf(
            admin,
          )
          assert(
            adminMaticBalanceAfterWithdraw.gt(adminMaticBalanceBeforeWithdraw),
          )
          truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) => {
            return (
              ev.totalGameInterest.eq(grossInterest.sub(regularAdminFee)) &&
              ev.adminFeeAmount.eq(expectedAdminFee)
            )
          })
        })

        it('withdraw incentives sent to contract', async () => {
          const incentiveAmount = new BN(toWad(10))
          const approvalAmount = segmentPayment
            .mul(new BN(segmentCount))
            .toString()
          const incentiveToken = await ERC20Mintable.new(
            'INCENTIVE',
            'INCENTIVE',
            { from: admin },
          )
          const contract = await GoodGhostingPolygonCurve.new(
            token.address,
            pool.address,
            tokenPosition,
            poolType,
            gauge.address,
            segmentCount,
            segmentLength,
            segmentPayment,
            fee,
            new BN(1),
            maxPlayersCount,
            curve.address,
            incentiveController.address,
            incentiveToken.address,
            { from: admin },
          )

          await incentiveToken.mint(
            contract.address,
            incentiveAmount.toString(),
            { from: admin },
          )
          await token.approve(contract.address, approvalAmount, {
            from: player1,
          })
          await contract.joinGame(0, { from: player1 })
          await advanceToEndOfGame()
          await contract.redeemFromExternalPool(0, { from: player1 })
          const incentiveBalanceBefore = await incentiveToken.balanceOf(admin)
          const result = await contract.adminFeeWithdraw({ from: admin })
          const incentiveBalanceAfter = await incentiveToken.balanceOf(admin)

          assert(
            incentiveBalanceAfter.eq(
              incentiveBalanceBefore.add(incentiveAmount),
            ),
            'admin incentive balance should be equal to incentive sent',
          )

          truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) =>
            ev.adminIncentiveAmount.eq(incentiveAmount),
          )
        })
      })

      context('with winners in the game', async () => {
        it('does not revert when there is no interest generated (neither external interest nor early withdrawal fees)', async () => {
          await joinGamePaySegmentsAndComplete(player1)
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })
          const ZERO = new BN(0)
          const result = await goodGhosting.adminFeeWithdraw({ from: admin })
          truffleAssert.eventEmitted(
            result,
            'AdminWithdrawal',
            (ev) => ev.totalGameInterest.eq(ZERO) && ev.adminFeeAmount.eq(ZERO),
          )
        })

        it("withdraw fees when there's only early withdrawal fees", async () => {
          await approveDaiToContract(player2)
          await goodGhosting.joinGame(0, { from: player2 })
          await goodGhosting.earlyWithdraw(0, { from: player2 })
          await joinGamePaySegmentsAndComplete(player1)
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })
          const contractBalance = await token.balanceOf(goodGhosting.address)
          const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call()
          const grossInterest = contractBalance.sub(totalGamePrincipal)
          const expectedAdminFee = grossInterest
            .mul(new BN(adminFee))
            .div(new BN(100))
          const result = await goodGhosting.adminFeeWithdraw({ from: admin })
          truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) => {
            return (
              ev.totalGameInterest.eq(grossInterest.sub(expectedAdminFee)) &&
              ev.adminFeeAmount.eq(expectedAdminFee)
            )
          })
        })

        it("withdraw fees when there's only interest generated by external pool", async () => {
          await joinGamePaySegmentsAndComplete(player1)
          //generating mock interest
          await mintTokensFor(admin)
          await token.approve(pool.address, ethers.utils.parseEther('1000'), {
            from: admin,
          })
          await pool.add_liquidity(
            [ethers.utils.parseEther('1000'), '0', '0'],
            0,
            true,
            { from: admin },
          )
          await pool.transfer(
            goodGhosting.address,
            ethers.utils.parseEther('1000'),
            { from: admin },
          )
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })

          const contractBalance = await token.balanceOf(goodGhosting.address)
          const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call()
          const grossInterest = contractBalance.sub(totalGamePrincipal)
          const expectedAdminFee = grossInterest
            .mul(new BN(adminFee))
            .div(new BN(100))

          const result = await goodGhosting.adminFeeWithdraw({ from: admin })
          truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) => {
            return (
              ev.totalGameInterest.eq(grossInterest.sub(expectedAdminFee)) &&
              ev.adminFeeAmount.eq(expectedAdminFee)
            )
          })
        })

        it("withdraw fees when there's both interest generated by external pool and early withdrawal fees", async () => {
          await approveDaiToContract(player2)
          await goodGhosting.joinGame(0, { from: player2 })
          await goodGhosting.earlyWithdraw(0, { from: player2 })

          await joinGamePaySegmentsAndComplete(player1)
          //generating mock interest
          await mintTokensFor(admin)
          await token.approve(pool.address, ethers.utils.parseEther('1000'), {
            from: admin,
          })
          await pool.add_liquidity(
            [ethers.utils.parseEther('1000'), '0', '0'],
            0,
            true,
            { from: admin },
          )
          await pool.transfer(
            goodGhosting.address,
            ethers.utils.parseEther('1000'),
            { from: admin },
          )
          await goodGhosting.redeemFromExternalPool(0, { from: player1 })

          const contractBalance = await token.balanceOf(goodGhosting.address)
          const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call()
          const grossInterest = contractBalance.sub(totalGamePrincipal)
          const expectedAdminFee = grossInterest
            .mul(new BN(adminFee))
            .div(new BN(100))
          const gameInterest = await goodGhosting.totalGameInterest.call()

          console.log(contractBalance.toString())
          console.log(totalGamePrincipal.toString())
          console.log(grossInterest.toString())
          console.log(gameInterest.toString())
          console.log(expectedAdminFee.toString())

          const result = await goodGhosting.adminFeeWithdraw({ from: admin })
          truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) => {
            return (
              ev.totalGameInterest.eq(grossInterest.sub(expectedAdminFee)) &&
              ev.adminFeeAmount.eq(expectedAdminFee)
            )
          })
        })

        it('does not withdraw any incentives sent to contract', async () => {
          const incentiveAmount = new BN(toWad(10))
          const approvalAmount = segmentPayment
            .mul(new BN(segmentCount))
            .toString()
          const incentiveToken = await ERC20Mintable.new(
            'INCENTIVE',
            'INCENTIVE',
            { from: admin },
          )
          const contract = await GoodGhostingPolygonCurve.new(
            token.address,
            pool.address,
            tokenPosition,
            poolType,
            gauge.address,
            segmentCount,
            segmentLength,
            segmentPayment,
            fee,
            new BN(1),
            maxPlayersCount,
            curve.address,
            incentiveController.address,
            incentiveToken.address,
            { from: admin },
          )

          await incentiveToken.mint(
            contract.address,
            incentiveAmount.toString(),
            { from: admin },
          )
          await token.approve(contract.address, approvalAmount, {
            from: player1,
          })
          await joinGamePaySegmentsAndComplete(player1, contract)
          await advanceToEndOfGame()
          await contract.redeemFromExternalPool(0, { from: player1 })
          const incentiveBalanceBefore = await incentiveToken.balanceOf(admin)
          const result = await contract.adminFeeWithdraw({ from: admin })
          const incentiveBalanceAfter = await incentiveToken.balanceOf(admin)

          assert(
            incentiveBalanceAfter.eq(incentiveBalanceBefore),
            'admin incentive balance before game should be equal to balance after game',
          )

          truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) =>
            ev.adminIncentiveAmount.eq(new BN(0)),
          )
        })
      })
    })

    describe('admin tries to withdraw fees with admin percentage fee equal to 0 and no winners', async () => {
      it('does not revert when there is no interest generated', async () => {
        goodGhosting = await GoodGhostingPolygonCurve.new(
          token.address,
          pool.address,
          tokenPosition,
          poolType,
          gauge.address,
          segmentCount,
          segmentLength,
          segmentPayment,
          fee,
          0,
          maxPlayersCount,
          curve.address,
          incentiveController.address,
          ZERO_ADDRESS,
          { from: admin },
        )
        await joinGamePaySegmentsAndComplete(player1)
        //generating mock interest

        await mintTokensFor(goodGhosting.address)
        await mintTokensFor(admin)
        await goodGhosting.redeemFromExternalPool(0, { from: player1 })
        const contractBalance = await token.balanceOf(goodGhosting.address)
        const totalGamePrincipal = await goodGhosting.totalGamePrincipal.call()
        const grossInterest = contractBalance.sub(totalGamePrincipal)
        const ZERO = new BN(0)
        const result = await goodGhosting.adminFeeWithdraw({ from: admin })
        truffleAssert.eventEmitted(
          result,
          'AdminWithdrawal',
          (ev) =>
            ev.totalGameInterest.eq(grossInterest) &&
            ev.adminFeeAmount.eq(ZERO),
        )
      })

      it('withdraw incentives sent to contract', async () => {
        const incentiveAmount = new BN(toWad(10))
        const approvalAmount = segmentPayment
          .mul(new BN(segmentCount))
          .toString()
        const incentiveToken = await ERC20Mintable.new(
          'INCENTIVE',
          'INCENTIVE',
          { from: admin },
        )
        const contract = await GoodGhostingPolygonCurve.new(
          token.address,
          pool.address,
          tokenPosition,
          poolType,
          gauge.address,
          segmentCount,
          segmentLength,
          segmentPayment,
          fee,
          0,
          maxPlayersCount,
          curve.address,
          incentiveController.address,
          incentiveToken.address,
          { from: admin },
        )

        await incentiveToken.mint(
          contract.address,
          incentiveAmount.toString(),
          { from: admin },
        )
        await token.approve(contract.address, approvalAmount, { from: player1 })
        await contract.joinGame(0, { from: player1 })
        await advanceToEndOfGame()
        await contract.redeemFromExternalPool(0, { from: player1 })
        const incentiveBalanceBefore = await incentiveToken.balanceOf(admin)
        const result = await contract.adminFeeWithdraw({ from: admin })
        const incentiveBalanceAfter = await incentiveToken.balanceOf(admin)

        assert(
          incentiveBalanceAfter.eq(incentiveBalanceBefore.add(incentiveAmount)),
          'admin incentive balance should be equal to incentive sent',
        )

        truffleAssert.eventEmitted(result, 'AdminWithdrawal', (ev) =>
          ev.adminIncentiveAmount.eq(incentiveAmount),
        )
      })
    })

    describe('as a Pausable contract', async () => {
      describe('checks Pausable access control', async () => {
        it('does not revert when admin invokes pause()', async () => {
          truffleAssert.passes(
            goodGhosting.pause({ from: admin }),
            'Ownable: caller is owner but failed to pause the contract',
          )
        })

        it('does not revert when admin invokes unpause()', async () => {
          await goodGhosting.pause({ from: admin })
          truffleAssert.passes(
            goodGhosting.unpause({ from: admin }),
            'Ownable: caller is owner but failed to unpause the contract',
          )
        })

        it('reverts when non-admin invokes pause()', async () => {
          await truffleAssert.reverts(
            goodGhosting.pause({ from: player1 }),
            'Ownable: caller is not the owner',
          )
        })

        it('reverts when non-admin invokes unpause()', async () => {
          await goodGhosting.pause({ from: admin })
          await truffleAssert.reverts(
            goodGhosting.unpause({ from: player1 }),
            'Ownable: caller is not the owner',
          )
        })
      })

      describe('checks Pausable contract default behavior', () => {
        beforeEach(async function () {
          await goodGhosting.pause({ from: admin })
        })

        describe('checks Pausable contract default behavior', () => {
          it('pauses the contract', async () => {
            const result = await goodGhosting.paused.call({ from: admin })
            assert(result, 'contract is not paused')
          })

          it('unpauses the contract', async () => {
            await goodGhosting.unpause({ from: admin })
            const result = await goodGhosting.pause.call({ from: admin })
            assert(result, 'contract is paused')
          })
        })
      })

      describe('as a Ownable Contract', async () => {
        it('reverts when admins tries to renounceOwnership without unlocking it first', async () => {
          await truffleAssert.reverts(
            goodGhosting.renounceOwnership({ from: admin }),
            'Not allowed',
          )
        })

        it('allows admin to renounceOwnership after unlocking it first', async () => {
          await goodGhosting.unlockRenounceOwnership({ from: admin })
          const currentOwner = await goodGhosting.owner({ from: admin })
          assert(currentOwner, admin)
          truffleAssert.passes(
            goodGhosting.renounceOwnership({ from: admin }),
            'Unexpected Error',
          )
          const newOwner = await goodGhosting.owner({ from: admin })
          assert(newOwner, ZERO_ADDRESS)
        })
      })
    })
  })
}

module.exports = {
  shouldBehaveLikeGoodGhostingPolygonCurve,
}
