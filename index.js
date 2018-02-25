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


/**
 * @param {string}
 */
function buttonCallback(label, code) {
    if (debug) {
        // We can (but don't necessarily have to) show something to the user, such
        // as 'look at your device'.
        // Codes are in the format ButtonRequest_[type] where [type] is one of the
        // types, defined here:
        // https://github.com/trezor/trezor-common/blob/master/protob/types.proto#L78-L89
        console.log('User is now asked for an action on device', code);
    }
    console.log("Look at device " + label + " and press the button, human.");
}

/**
 * @param {Function<Error, string>} callback
 */
function passphraseCallback(callback) {
    console.log('Please enter passphrase.');

    // note - disconnecting the device should trigger process.stdin.pause too, but that
    // would complicate the code

    // we would need to pass device in the function and call device.on('disconnect', ...

    process.stdin.resume();
    process.stdin.on('data', function (buffer) {
        var text = buffer.toString().replace(/\n$/, "");
        process.stdin.pause();
        callback(null, text);
    });
}

var list;
var dev;

// you should do this to release devices on exit
function TrezorProvider(provider_url, path) {
	list = new trezor.DeviceList({debug: debug});
	list.on('connect', function (device) {
		dev = device;
        if (debug) {
            console.log('Connected a device:', device);
            console.log('Devices:', list.asArray());
        }
        console.log("Connected device " + device.features.label);

	    device.on('pin', (type, callback) => {
	        console.error("Entering pin is not supported. Unlock TREZOR in other app!");
	        callback(new Error());
	    });

        // For convenience, device emits 'disconnect' event on disconnection.
        device.on('disconnect', function () {
            console.log("Disconnected device");
            dev = null;
        });

        // You generally want to filter out devices connected in bootloader mode:
        if (device.isBootloader()) {
            throw new Error('Device is in bootloader mode, re-connected it');
        }

    });

    list.on('error', function (error) {
        //console.error('List error:', error);
    });

    process.on('exit', function() {
        list.onbeforeunload();
    });

	function inTrezorSession(cb) {
		if (dev == null) {
			return Promise.reject(new Error("no device connected"));
		} else {
		    return dev.waitForSessionAndRun(cb);
		}
	}

	this.engine = new ProviderEngine();
	this.engine.addProvider(new HookedSubprovider({
	getAccounts: function(cb) {
	    inTrezorSession(
	        session => session.ethereumGetAddress(path, false)
	    )
	    .then(resp => "0x" + resp.message.address)
	    .then(address => {cb(null, [address]); console.log("address: " + address)})
	    .catch(cb);
	},
	signTransaction: function(txParams, cb) {
		inTrezorSession(
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
	this.engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider(provider_url)));
	this.engine.start(); // Required by the provider engine.
};

TrezorProvider.prototype.sendAsync = function() {
  this.engine.sendAsync.apply(this.engine, arguments);
};

TrezorProvider.prototype.send = function() {
  return this.engine.send.apply(this.engine, arguments);
};

module.exports = TrezorProvider;

