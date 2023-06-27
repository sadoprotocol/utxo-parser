"use strict";
const http = require('http');

const rpcCredential = {
  host: process.env.RPCHOST,
  port: process.env.RPCPORT,
  user: process.env.RPCUSER,
  password: process.env.RPCPASSWORD
}

function rpc(method, args = []) {
  return new Promise((resolve, reject) => {
    let parseString = "";

    for (let i = 0; i < args.length; i++) {
      if (i > 0) {
        parseString += ", ";
      }

      if (typeof args[i] === 'string') {
        parseString += '"' + args[i] + '"';
      } else {
        parseString += '' + args[i];
      }
    }

    const dataString = '{"jsonrpc": "1.0", "id": "curltest", "method": "' + method + '", "params": [' + parseString + ']}';

    const headers = {
      'Content-Type': 'text/plain',
      'Content-Length': Buffer.byteLength(dataString),
    };

    const options = {
      hostname: rpcCredential.host,
      port: rpcCredential.port,
      method: 'POST',
      headers: headers,
      auth: rpcCredential.user + ':' + rpcCredential.password
    };

    let bodyRes = "";

    const req = http.request(options, (res) => {
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        bodyRes += chunk;
      });
      res.on('end', () => {
        try {
          bodyRes = JSON.parse(bodyRes);

          if (bodyRes.result === null && bodyRes.error) {
            reject(bodyRes.error.message);
          } else {
            resolve(bodyRes.result);
          }
        } catch (err) {
          resolve(bodyRes);
        }
      });
    });

    req.on('error', (e) => {
      reject(e.message);
    });

    req.write(dataString);
    req.end(); 
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
exports.getMempoolEntry = getMempoolEntry;
exports.getTxOut = getTxOut;
exports.getRawMempool = getRawMempool;
exports.getMempoolInfo = getMempoolInfo;


async function getBlockHash(number) {
  return await rpc('getblockhash', [ number ]);
}

async function getBlock(blockHash) {
  return await rpc( 'getblock', [ blockHash, 2 ]);
}

async function getBlockCount() {
  return await rpc('getblockcount');
}

async function deriveAddresses(descriptor) {
  return await rpc('deriveaddresses', [ descriptor ]);
}

async function getRawTransaction(txid) {
  return await rpc('getrawtransaction', [ txid, true ]);
}

async function getMempoolEntry(wtxid) {
  return await rpc('getmempoolentry', [ wtxid ]);
}

async function getTxOut(txid, n) {
  return await rpc('gettxout', [ txid, n ]);
}

async function getRawMempool(verbose = false) {
  return await rpc('getrawmempool', [ verbose ]);
}

async function getMempoolInfo() {
  return await rpc('getmempoolinfo');
}

async function decodeScript(hex) {
  return await rpc('decodescript', [ hex ]);
}

async function sendRawTransaction(signedHex) {
  return await rpc('sendrawtransaction', [ signedHex ]);
}

async function testMempoolAccept(signedHexArray) {
  return await rpc('testmempoolaccept', [ signedHexArray ]);
}

async function estimateSmartFee(numberOfBlocks) {
  return await rpc('estimatesmartfee', [ numberOfBlocks ]);
}

async function getIndexInfo() {
  return await rpc('getindexinfo');
}
