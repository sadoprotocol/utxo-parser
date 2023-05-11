# UTXO Parser

## Requirement

1. NodeJS
2. Bitcoin Full Node + Index
3. Bitcoin RPC
4. MongoDB


## Setup

Enable `-txindex`. For example, `.bitcoin/bitcoin.conf`:

```
rpcauth=<username>:<hashed_password>
server=1
txindex=1
```

Set the following

```sh
# Set the environment to proper values
$ cp dotenv .env

# Install dependencies
$ npm install
```

## Usage

> Perform all commands below from the root directory of the program

### Indexer

```sh
# Start
$ npm run indexer

# From a specific block height
$ echo 2590 > data/block_n && node bin/index.js

# Re-index
$ rm data/block_n
$ npm run indexer
```

### Repeater

> Continue updating cache transactions

```sh
# Start
$ npm run repeater
```


### Address lookup

```sh
# Balance
$ node bin/index.js balance <address>

# Transactions
$ node bin/index.js transactions <address>

# Unspents
$ node bin/index.js unspents <address>

# Transaction
$ node bin/index.js transaction <txid>
```

### Monitor block progress

```sh
# Watch the index
$ watch -n 1 cat data/block_n
```
