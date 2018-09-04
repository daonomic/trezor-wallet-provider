import bippath = require('bip32-path')
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

export const createTrezorProvider = (path: string) => {
  const pathArray = bippath.fromString(path).toPathArray()
  let currentDevice: any
  let resolveReady: () => any = () => undefined
  const ready: () => Promise<void> = () =>
    new Promise((resolve) => {
      if (currentDevice) {
        return resolve()
      }
      resolveReady = resolve
    })
  const addListeners = (devices: any) => {
    devices.on('connect', (device: any) => {
      console.log('Device connected')
      device.on(
        'pin',
        async (
          type: string,
          callback: (err?: Error, pinCoordinates?: string) => void
        ) => {
          try {
            const pinCoordinates = await getPinCoordinates()
            return callback(undefined, pinCoordinates)
          } catch (error) {
            return callback(error)
          }
        }
      )
      resolveReady()
      currentDevice = device
    })
  }
  const getAccounts = async (
    callback: (err?: Error | null, result?: [string]) => void
  ) => {
    await ready()
    console.log('Getting accounts now')
    currentDevice.run(
      async (session: any): Promise<void> => {
        try {
          const {
            message: { address },
          } = await session.ethereumGetAddress(pathArray, false)
          callback(null, [`0x${address}`])
        } catch (err) {
          callback(err)
        }
        return Promise.resolve()
      }
    )
  }

  const signTransaction = async (
    txParams: any,
    callback: (err: Error | null, result?: any) => void
  ) => {
    await ready()
    currentDevice.run(async (session: any) => {
      try {
        const signedTransaction = await session.signEthTx(
          pathArray,
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

  addListeners(new trezor.DeviceList())

  return new HookedWalletSubprovider({
    getAccounts,
    signTransaction,
  })
}
