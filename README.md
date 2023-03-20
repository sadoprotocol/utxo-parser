# Bitcoin NodeJS Explorer

## Requirement

1. NodeJS
2. Bitcoin RPC
3. MongoDB


## Setup

Enable `-txindex`. For example, `.bitcoin/bitcoin.conf`:

```
rpcauth=bitcoin-testnet:3a009357ba2594fa9932e5e1096025d0$1eaf8394a350e21fc948fbc56d8f8efc185133ac8403207421b754ec1160666d
server=1
txindex=1
```

Set the following

```sh
# Set the environment properly
$ cp dotenv .env

# Install dependencies
$ npm install
```

## Usage

### Crawl

```sh
# Start
$ node bin/index.js

# From a specific block height
$ echo 2590 > data/block_n && node bin/index.js
```
