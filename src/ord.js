"use strict";

const { spawn } = require("child_process");

const network = process.env.NETWORK;
const ordCommand = process.env.ORDCOMMAND || "ord";
const altCommandDir = process.env.ALTORDCOMMANDDIR || "";

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

async function caller(arg = []) {
  let res = await rpc(arg);

  if (
    res.includes('Database already open. Cannot acquire lock.')
    && altCommandDir.trim() !== ''
  ) {
    // ord@afwcxx --data-dir /home/bitcoin/ord-data/ --index-sats index
    let newArg = [];

    for (let m = 0; m < arg.length; m++) {
      newArg.push(arg[m]);

      if (arg[m].includes(ordCommand)) {
        newArg.push("--data-dir");
        newArg.push(altCommandDir);
      }
    }

    res = await rpc(newArg);
  }

  return res;
}

// exports.getBlockHash = getBlockHash;
exports.list = list;
exports.gioo = gioo;
exports.gie = gie;
exports.traits = traits;
exports.find = find;



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
    let res = await caller([ 'list', outpoint ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

async function gioo(outpoint) {
  try {
    let res = await caller([ 'gioo', outpoint ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

async function gie(inscriptionId) {
  try {
    let res = await caller([ 'gie', inscriptionId ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

async function traits(sat) {
  try {
    let res = await caller([ 'traits', sat ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

async function find(sat) {
  try {
    let res = await caller([ 'find', sat ]);
    return parse(res);
  } catch (err) {
    return false;
  }
}

