'use strict';

var HookedWalletSubprovider = require('web3-provider-engine/subproviders/hooked-wallet.js');
var Transaction = require('ethereumjs-tx');
var trezor = require('trezor.js-node');
var util = require('util');
var bippath = require('bip32-path')

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

function getUserHome() {
  return process.env[(process.platform == 'win32') ? 'USERPROFILE' : 'HOME'];
}

function buffer(hex) {
	if (hex == null) {
		return new Buffer('', 'hex');
	} else {
		return new Buffer(normalize(hex), 'hex');
	}
}

var trezorInstance;
var accountsMap = {};

class Trezor {
	constructor(path) {
		var self = this;

		this.devices = [];
		this.path = path;
		this.list = new trezor.DeviceList({debug: debug});
		this.list.on('connect', function (device) {
			var dev = device;
	        console.log("Connected device " + device.features.label);
	        self.devices.push(device);

		    device.on('pin', (type, callback) => {
		        console.error("Entering pin is not supported. Unlock TREZOR in other app!");
		        callback(new Error());
		    });

			device.on('passphrase', callback => {
				try {
					var json = require(getUserHome() + "/.trezor/passphrase.json");
					callback(null, json.passphrase);
				} catch(err) {
					console.log("save your passphrase to ~/.trezor/passphrase.json");
					callback(err);
				}
			});

	        // For convenience, device emits 'disconnect' event on disconnection.
	        device.on('disconnect', function () {
	            self.devices.splice(self.devices.indexOf(dev), 1);
	            console.log("Disconnected device");
	        });

	        // You generally want to filter out devices connected in bootloader mode:
	        if (device.isBootloader()) {
	            throw new Error('Device is in bootloader mode, re-connected it');
	        }

		    self.getAccounts(function(err, result) {
		        if (err != null) {
		            console.log("error getting address: " + err);
		        } else {
		            console.log("address: " + result);
		        }
		    });
	    });
	}

	checkOneDeviceConnected() {
	    if (this.devices.length == 0) {
	        return Promise.reject(new Error("no device connected"));
	    } else if (this.devices.length > 1){
	        return Promise.reject(new Error("more than one device connected"));
	    } else {
	        return Promise.resolve(this.devices[0]);
	    }
	}

	inTrezorSession(device, cb) {
	    return device.waitForSessionAndRun(cb);
    }

	getAccounts(cb) {
		var self = this;
		this.checkOneDeviceConnected()
		    .then(device => {
		        if (accountsMap[device.features.device_id] == null) {
		            return this.inTrezorSession(device, session => session.ethereumGetAddress(self.path, false))
                        .then(resp => "0x" + resp.message.address)
                        .then(address => {
                            accountsMap[device.features.device_id] = [address];
                            return address;
                        });
		        } else {
		            return Promise.resolve(accountsMap[device.features.device_id]);
		        }
		    })
            .then(address => {cb(null, [address])})
	        .catch(cb);
	}

	signTransaction(txParams, cb) {
		var self = this;
		this.checkOneDeviceConnected()
		    .then(device => this.inTrezorSession(device, session => session.signEthTx(self.path, normalize(txParams.nonce), normalize(txParams.gasPrice), normalize(txParams.gas), normalize(txParams.to), normalize(txParams.value), normalize(txParams.data))))
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

	static init(path) {
		if (trezorInstance == null) {
			trezorInstance = new Trezor(path);
		} else {
			trezorInstance.path = path;
		}
		return trezorInstance;
	}
}

class TrezorProvider extends HookedWalletSubprovider {
	constructor(path) {
		var pathArray = bippath.fromString(path).toPathArray();
		var trezor = Trezor.init(pathArray);
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

