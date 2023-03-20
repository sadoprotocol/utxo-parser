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


function sanitize(aString) {
  return aString.replace(/(\r\n|\n|\r)/gm, "");
}

function parse(aString) {
  return JSON.parse(aString);
}

async function getBlockHash(number) {
  let res = await rpc([ 'getblockhash', number ]);
  return sanitize(res);
}

async function getBlock(blockHash) {
  let res = await rpc([ 'getblock', blockHash, 2 ]);
  return parse(res);
}

async function getBlockCount() {
  let res = await rpc([ 'getblockcount' ]);
  return sanitize(res);
}

async function deriveAddresses(descriptor) {
  return await rpc([ 'deriveaddresses', descriptor ]);
}

async function getRawTransaction(txid) {
  let res = await rpc([ 'getrawtransaction', txid, true ]);
  return parse(res);
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
