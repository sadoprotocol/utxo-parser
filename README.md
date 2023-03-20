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

> Warning!
> If you are indexing from block height 0
> Set `CRAWLERMULTITHREAD=0` if the machine spec is low 
> - Lower than 8GB memory
> - Really slow CPU
> Once it has at caught up, enabling `CRAWLERMULTITHREAD=1` should be alright.

## Usage

> Perform all commands below from the root directory of the program

### Crawl

```sh
# Start
$ node bin/index.js

# From a specific block height
$ echo 2590 > data/block_n && node bin/index.js

# Re-index
$ rm data/block_n && node bin/index.js
```

### Address lookup

```sh
# Balance
$ node bin/index.js balance <address>

# Transactions
$ node bin/index.js transactions <address>

# Unspents
$ node bin/index.js unspents <address>
```

### Monitor

```sh
# Watch the index
$ watch cat data/block_n
```
