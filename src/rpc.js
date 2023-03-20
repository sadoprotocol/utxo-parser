"use strict";

const { spawn } = require("child_process");

const network = process.env.NETWORK;
const rpcCredential = {
  user: process.env.RPCUSER,
  password: process.env.RPCPASSWORD
}

const networkFlag = {
  "mainnet": "",
  "testnet": "--testnet",
  "regtest": "--regtest"
}

if (networkFlag[network] === undefined) {
  throw new Error('Unsupported network defined.');
}

function rpc(arg = []) {
  return new Promise((resolve, reject) => {
    let commandArg = [];

    if (networkFlag[network].trim() !== '') {
      commandArg.push(networkFlag[network].trim());
    }

    if (rpcCredential.user && rpcCredential.password) {
      commandArg.push("-rpcuser=" + rpcCredential.user);
      commandArg.push("-rpcpassword=" + rpcCredential.password);
    }

    commandArg = commandArg.concat(arg);

    const exec = spawn("bitcoin-cli", commandArg);

    let output = '';

    exec.stdout.on("data", data => {
      output += data;
    });

    exec.stderr.on("data", data => {
      output += data;
    });

    exec.on('error', (error) => {
      console.log(`error: ${error.message}`);
      reject(`${error.message}`);
    });

    exec.on("close", code => {
      resolve(`${output}`);
    });
  });
}

exports.getBlockHash = getBlockHash;
exports.getBlock = getBlock;
exports.getBlockCount = getBlockCount;
exports.deriveAddresses = deriveAddresses;
exports.getRawTransaction = getRawTransaction;
exports.decodeScript = decodeScript;
exports.sendRawTransaction = sendRawTransaction;
exports.testMempoolAccept = testMempoolAccept;
exports.estimateSmartFee = estimateSmartFee;
exports.getIndexInfo = getIndexInfo;



async function getBlockHash(number) {
  return await rpc([ 'getblockhash', number ]);
}

async function getBlock(blockHash) {
  return await rpc([ 'getblock', blockHash, 2 ]);
}

async function getBlockCount() {
  return await rpc([ 'getblockcount' ]);
}

async function deriveAddresses(descriptor) {
  return await rpc([ 'deriveaddresses', descriptor ]);
}

async function getRawTransaction(txid) {
  return await rpc([ 'getrawtransaction', txid, true ]);
}

async function decodeScript(hex) {
  return await rpc([ 'decodescript', hex ]);
}

async function sendRawTransaction(signedHex) {
  return await rpc([ 'sendrawtransaction', signedHex ]);
}

async function testMempoolAccept(signedHexArray) {
  return await rpc([ 'testmempoolaccept', signedHexArray ]);
}

async function estimateSmartFee(numberOfBlocks) {
  return await rpc([ 'estimatesmartfee', numberOfBlocks ]);
}

async function getIndexInfo() {
  return await rpc([ 'getindexinfo' ]);
}
