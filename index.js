'use strict';

var HookedSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js');
var Transaction = require('ethereumjs-tx');
var trezor = require('trezor.js-node');
var util = require('util');

var debug = false;

function normalize(hex) {
	if (hex == null) {
		return null;
	}
	if (hex.startsWith("0x")) {
		hex = hex.substring(2);
	}
	if (hex.length % 2 != 0) {
		hex = "0" + hex;
	}
	return hex;
}

function buffer(hex) {
	if (hex == null) {
		return new Buffer('', 'hex');
	} else {
		return new Buffer(normalize(hex), 'hex');
	}
}

class Trezor {
	constructor(path) {
		var self = this;

		this.path = path;
		this.list = new trezor.DeviceList({debug: debug});
		this.list.on('connect', function (device) {
	        console.log("Connected device " + device.features.label);

		    device.on('pin', (type, callback) => {
		        console.error("Entering pin is not supported. Unlock TREZOR in other app!");
		        callback(new Error());
		    });

	        // For convenience, device emits 'disconnect' event on disconnection.
	        device.on('disconnect', function () {
	            console.log("Disconnected device");
	        });

	        // You generally want to filter out devices connected in bootloader mode:
	        if (device.isBootloader()) {
	            throw new Error('Device is in bootloader mode, re-connected it');
	        }
	    });
	}

	inTrezorSession(cb) {
        const devices = this.list.asArray();
        console.log(devices);
        if (devices.length == 0) {
            return Promise.reject(new Error("no device connected"));
        } else {
            return devices[0].waitForSessionAndRun(cb);
        }
    }

	getAccounts(cb) {
		var self = this;
	    this.inTrezorSession(
	        session => session.ethereumGetAddress(self.path, false)
	    )
	    .then(resp => "0x" + resp.message.address)
	    .then(address => {cb(null, [address]); console.log("address: " + address)})
	    .catch(cb);
	}

	signTransaction(txParams, cb) {
		var self = this;
		this.inTrezorSession(
			session => session.signEthTx(self.path, normalize(txParams.nonce), normalize(txParams.gasPrice), normalize(txParams.gas), normalize(txParams.to), normalize(txParams.value), normalize(txParams.data))
		)
		.then(result => {
			const tx = new Transaction({
			   nonce: buffer(txParams.nonce),
			   gasPrice: buffer(txParams.gasPrice),
			   gasLimit: buffer(txParams.gas),
			   to: buffer(txParams.to),
			   value: buffer(txParams.value),
			   data: buffer(txParams.data),
			   v: result.v,
			   r: buffer(result.r),
			   s: buffer(result.s)
			});
			cb(null, '0x' + tx.serialize().toString('hex'));
		})
		.catch(cb);
	}

}

class TrezorProvider extends HookedSubprovider {
	constructor(path) {
		var trezor = new Trezor(path);
		super({
			getAccounts: function(cb) {
				trezor.getAccounts(cb);
			},
			signTransaction: function(txParams, cb) {
				trezor.signTransaction(txParams, cb);
			}
		});
	}
}

module.exports = TrezorProvider;

