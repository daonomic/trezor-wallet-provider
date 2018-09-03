import * as test from 'tape'
import Web3 = require('web3')
import ProviderEngine = require('web3-provider-engine')
import FiltersSubprovider = require('web3-provider-engine/subproviders/filters')
import RpcSubprovider = require('web3-provider-engine/subproviders/rpc')
import TrezorProvider from './index'

test('It should get some accounts', async (assert) => {
  assert.plan(2)

  const engine = new ProviderEngine()
  engine.addProvider(new TrezorProvider("m/44'/1'/0'/0/0"))
  engine.addProvider(new FiltersSubprovider())
  engine.addProvider(
    new RpcSubprovider({ rpcUrl: 'http://parity-ropsten.domain.com' })
  )
  engine.start()
  const web3 = new Web3(engine)
  web3.eth.getAccounts((error, accounts) => {
    assert.notOk(error)
    assert.equal(accounts.length, 1)
  })
})
