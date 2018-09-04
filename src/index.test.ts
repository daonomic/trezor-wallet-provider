import * as test from 'tape'
import Web3 = require('web3')
import ProviderEngine = require('web3-provider-engine')
import FilterSubprovider = require('web3-provider-engine/subproviders/filters')
import RpcSubprovider = require('web3-provider-engine/subproviders/rpc')
import { createTrezorProvider } from './index'

test('It should get some accounts', async (assert) => {
  assert.plan(2)

  const engine = new ProviderEngine()
  const web3 = new Web3(engine)

  engine.addProvider(new FilterSubprovider())
  engine.addProvider(createTrezorProvider('m/44\'/1\'/0\'/0/0'))
  engine.addProvider(
    new RpcSubprovider({
      rpcUrl: 'http://localhost:8565/',
    })
  )
  engine.start()

  engine.on('error', ((err: any) => {
    // report connectivity errors
    console.error(err.stack)
  }) as any)
  web3.eth.getAccounts((error, accounts) => {
    assert.notOk(error)
    assert.equal(accounts.length, 1)
    engine.stop()
  })
})
