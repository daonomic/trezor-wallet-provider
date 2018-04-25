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

var exec = require('child_process').exec;
function execute(command, callback){
	exec(command, function(error, stdout, stderr) {
		if (error != null) {
			console.log(error);
		}
        callback(stdout);
    });
};

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

class Trezor {
	constructor(path) {
		var self = this;

		this.accountsMap = {};
		this.devices = [];
		this.path = path;
		this.list = new trezor.DeviceList({debug: debug});
	    this.list.acquireFirstDevice().then(obj => {
	        self.device = obj.device;
	        self.session = obj.session;

            obj.device.on('passphrase', callback => {
                execute("java -cp " + require.resolve("./ui-0.1.0.jar") + " io.daonomic.trezor.AskPassphrase", out => callback(null, out.trim()));
            });

		    obj.device.on('pin', (type, callback) => {
		        console.error("Entering pin is not supported. Unlock TREZOR in other app!");
		        callback(new Error());
		    });

            // For convenience, device emits 'disconnect' event on disconnection.
            obj.device.on('disconnect', function () {
                console.log("Disconnected device");
                self.device = null;
                self.session = null;
            });

	        obj.session.ethereumGetAddress(self.path, false)
	            .then(resp => "0x" + resp.message.address)
	            .then(address => console.log("Current address: " + address))
	            .catch(console.log)
	    }).catch(console.log);
	}

	checkSession() {
		if (this.session != null) {
			return Promise.resolve(this.session);
		} else {
			return Promise.reject("No session opened");
		}
	}

	getAccounts(cb) {
		var self = this;
		this.checkSession()
			.then(session => session.ethereumGetAddress(self.path, false))
			.then(resp => "0x" + resp.message.address)
			.then(address => {cb(null, [address])})
			.catch(cb)
	}

	signTransaction(txParams, cb) {
		var self = this;
		this.checkSession()
			.then(session => session.signEthTx(self.path, normalize(txParams.nonce), normalize(txParams.gasPrice), normalize(txParams.gas), normalize(txParams.to), normalize(txParams.value), normalize(txParams.data)))
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

