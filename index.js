'use strict';

var ProviderEngine = require("web3-provider-engine");
var FiltersSubprovider = require('web3-provider-engine/subproviders/filters.js');
var HookedSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js');
var Web3Subprovider = require("web3-provider-engine/subproviders/web3.js");
var Web3 = require("web3");
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

class TrezorProvider {
	constructor(url, path) {
		var self = this;
		this.url = url;
		this.path = path;
		this.list = new trezor.DeviceList({debug: debug});
		this.list.on('connect', function (device) {
	        if (debug) {
	            console.log('Connected a device:', device);
	            console.log('Devices:', this.list.asArray());
	        }
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

		this.engine = new ProviderEngine();
		this.engine.addProvider(new HookedSubprovider({
			getAccounts: function(cb) {
			    self.inTrezorSession(
			        session => session.ethereumGetAddress(path, false)
			    )
			    .then(resp => "0x" + resp.message.address)
			    .then(address => {cb(null, [address]); console.log("address: " + address)})
			    .catch(cb);
			},
			signTransaction: function(txParams, cb) {
				self.inTrezorSession(
					session => session.signEthTx(path, normalize(txParams.nonce), normalize(txParams.gasPrice), normalize(txParams.gas), normalize(txParams.to), normalize(txParams.value), normalize(txParams.data))
				)
				.then(result => {
					var tx = new Transaction({
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
		}));
		this.engine.addProvider(new FiltersSubprovider());
		this.engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(url)));
		this.engine.start(); // Required by the provider engine.
	}

	inTrezorSession(cb) {
		var devices = this.list.asArray();
        if (devices.length == 0) {
            return Promise.reject(new Error("no device connected"));
        } else {
            return devices[0].waitForSessionAndRun(cb);
        }
    }

}

TrezorProvider.prototype.sendAsync = function() {
  this.engine.sendAsync.apply(this.engine, arguments);
};

TrezorProvider.prototype.send = function() {
  return this.engine.send.apply(this.engine, arguments);
};

module.exports = TrezorProvider;

