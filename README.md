# trezor-wallet-provider
Trezor-enabled Web3 subprovider for [metamask's provider engine](https://github.com/MetaMask/provider-engine). Use it to sign transactions with Trezor hardware wallet

## Install

```
$ npm install trezor-wallet-provider
```

## General Usage

You can use this subprovider to sign transaction using trezor hardware wallet.

```javascript
var engine = new ProviderEngine();
engine.addProvider(new TrezorProvider("m/44'/1'/0'/0/0"));
engine.addProvider(new FiltersSubprovider());
engine.addProvider(new Web3Subprovider(new Web3.providers.HttpProvider("http://ropsten.infura.com/{key}")));
engine.start();
```

TrezorProvider will expose one address for specified path

Parameters:

- `path`: `string`. derivation path for address

## Truffle Usage

You can easily use this within a Truffle configuration
