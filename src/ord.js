"use strict";

const { spawn } = require("child_process");
const fs = require('fs');

const network = process.env.NETWORK;
const ordCommand = process.env.ORDCOMMAND || "ord";
const ordDataDir = process.env.ORDDATADIR || "";
const ordDataDupDir = process.env.ORDDUPDATADIR || "";

const networkFlag = {
  "mainnet": "",
  "testnet": "-t",
  "regtest": "-r"
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

    commandArg = commandArg.concat(arg);

    const exec = spawn(ordCommand, commandArg);

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

async function call(arg = [], counter = 1) {
  let res = await rpc(arg);

  if (
    res.includes('Database already open. Cannot acquire lock.')
    && counter < 5
  ) {
    let wait = Math.floor(Math.random() * 4 + 1) * 100;
    await new Promise(resolve => setTimeout(resolve, wait));
    return await call(arg, counter++);
  }

  return res;
}

// exports.getBlockHash = getBlockHash;
exports.list = list;
exports.gioo = gioo;
exports.gie = gie;
exports.traits = traits;
exports.find = find;
exports.indexing = indexing;
exports.indexer_status = indexer_status;



// === modifiers

function sanitize(aString) {
  return aString.replace(/(\r\n|\n|\r)/gm, "");
}

function parse(aString) {
  return JSON.parse(aString);
}

// === callers

async function list(outpoint) {
  try {
    let res = await call([ 'list', outpoint ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

async function gioo(outpoint) {
  try {
    let res = await call([ 'gioo', outpoint ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

async function gie(inscriptionId) {
  try {
    let res = await call([ 'gie', inscriptionId ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

async function traits(sat) {
  try {
    let res = await call([ 'traits', sat ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

// Caution: very slow
async function find(sat) {
  try {
    let res = await call([ 'find', sat ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

async function indexing() {
  const path = ordDataDir + 'lock'

  try {
    if (fs.existsSync(path)) {
      return true;
    }

    return false;
  } catch(err) {
    return false;
  }
}

async function indexer_status() {
  const path = ordDataDir + 'height'
  const pathDup = ordDataDupDir + 'height'

  let firstIndexerRes = "not-found";
  let secondIndexerRes = "not-found";

  try {
    if (fs.existsSync(path)) {
      let data = fs.readFileSync(path, { encoding: 'utf8', flag: 'r' });

      if (!isNaN(data)) {
        firstIndexerRes = parseInt(data);
      } else {
        firstIndexerRes = data;
      }
    }

    if (fs.existsSync(pathDup)) {
      let data = fs.readFileSync(pathDup, { encoding: 'utf8', flag: 'r' });

      if (!isNaN(data)) {
        secondIndexerRes = parseInt(data);
      } else {
        secondIndexerRes = data;
      }
    }

    return {
      "first": firstIndexerRes,
      "second": secondIndexerRes
    };
  } catch(err) {
    return false;
  }
}
