import Transaction = require('ethereumjs-tx')
import * as readline from 'readline'
import trezor = require('trezor.js')

import HookedWalletSubprovider = require('web3-provider-engine/subproviders/hooked-wallet')

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
})

const getPinCoordinates: () => Promise<string> = async () =>
  new Promise<string>((resolve) => {
    rl.question('Type in PIN Coordinates', (pinCoordinates) => {
      resolve(pinCoordinates)
      rl.close()
    })
  })

function normalize(hex: any) {
  if (hex == null) {
    return null
  }
  if (hex.startsWith('0x')) {
    hex = hex.substring(2)
  }
  if (hex.length % 2 !== 0) {
    hex = '0' + hex
  }
  return hex
}

function buffer(hex: any) {
  if (hex == null) {
    return new Buffer('', 'hex')
  } else {
    return new Buffer(normalize(hex), 'hex')
  }
}

const addListeners = (device: any) => {
  device.on(
    'pin',
    async (callback: (err?: Error, pinCoordinates?: string) => void) => {
      try {
        const pinCoordinates = await getPinCoordinates()
        return callback(undefined, pinCoordinates)
      } catch (error) {
        return callback(error)
      }
    }
  )
}

const createGetAccounts = (device: any, path: string) => (
  callback: (err?: Error | null, result?: [string]) => void
) => {
  device.run(
    async (session: any): Promise<void> => {
      try {
        const {
          message: { address },
        } = await session.ethereumGetAddress(path, false)
        callback(null, [`0x${address}`])
      } catch (err) {
        callback(err)
      }
      return Promise.resolve()
    }
  )
}

const createSignTransaction = (device: any, path: string) => (
  txParams: any,
  callback: (err: Error | null, result?: any) => void
) => {
  device.run(async (session: any) => {
    try {
      const signedTransaction = await session.signEthTx(
        path,
        normalize(txParams.nonce),
        normalize(txParams.gasPrice),
        normalize(txParams.gas),
        normalize(txParams.to),
        normalize(txParams.value),
        normalize(txParams.data)
      )
      const tx = new Transaction({
        data: buffer(txParams.data),
        gasLimit: buffer(txParams.gas),
        gasPrice: buffer(txParams.gasPrice),
        nonce: buffer(txParams.nonce),
        r: buffer(signedTransaction.r),
        s: buffer(signedTransaction.s),
        to: buffer(txParams.to),
        v: signedTransaction.v,
        value: buffer(txParams.value),
      })
      callback(null, `0x${tx.serialize().toString('hex')}`)
    } catch (error) {
      callback(error)
    }
    return Promise.resolve()
  })
}

class TrezorProvider extends HookedWalletSubprovider {
  constructor(path: string) {
    const devices = new trezor.DeviceList()
    console.log(devices)
    const [device] = devices.devices
    addListeners(device)
    super({
      getAccounts: createGetAccounts(device, path),
      signTransaction: createSignTransaction(device, path),
    })
  }
}

export default TrezorProvider
