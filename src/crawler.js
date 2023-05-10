"use strict"

const Rpc = require('../src/rpc.js');
const Data = require('../src/data.js');
const Mongo = require('../src/mongodb');

const reorgMin = parseFloat(process.env.REORGMIN || 0.5);
const decimals = parseInt(process.env.DECIMALS || 8);
const interval = parseInt(process.env.CRAWLERINTERVAL || 10);
const multithreading = parseInt(process.env.CRAWLERMULTITHREAD || 0) === 0 ? false : true;
const crawlerMaxBlock = parseInt(process.env.CRAWLERMAXBLOCK || 0) === 0 ? false : parseInt(process.env.CRAWLERMAXBLOCK);

var working = false;

exports.start = start;




// === vins / vouts

function sats(a, decimal) {
  a = a + "";

  let b = "";
  let counter = decimal;
  let begin = false;
  let length = decimal + a.length;

  for (let i = 0; i < length; i++) {
    if (a[i] === '.') {
      begin = true;
      continue;
    }

    if (begin === false && a[i] === "0") {
      continue;
    }

    let num = a[i];

    if (typeof a[i] === 'undefined') {
      num = "0";
    }

    if (begin) {
      counter--;
    }

    b += num;

    if (counter === 0) {
      break;
    }
  }

  return parseInt(b);
}

async function captureVin(vin, n) {
  if (typeof vin.vout === 'undefined') {
    return false;
  }

  let tx = await Rpc.getRawTransaction(vin.prev_txid);

  if (tx) {
    let index = vin.vout;
    let vout = {};

    if (tx.vout[index].n !== index) {
      let foundIndex = tx.vout.findIndex(item => {
        item.n === index;
      });

      vout = tx.vout[foundIndex]
    } else {
      vout = tx.vout[index];
    }

    let derived = await Rpc.deriveAddresses(vout.scriptPubKey.desc);

    if (derived) {
      const db = Mongo.getClient();

      vout.sats = sats(vout.value, decimals)
      vout.addressFrom = derived[0];

      vin = { ...vin, ...vout };

      vin.n = n;

      await db.collection("vin").updateOne({
        "addressFrom": vin.addressFrom,
        "txHash": vin.txHash,
        "n": n
      }, {
        $set: vin
      }, {
        upsert: true
      });
    }
  }
}

async function captureVout(vout) {
  let derived = await Rpc.deriveAddresses(vout.scriptPubKey.desc);

  if (derived) {
    const db = Mongo.getClient();

    vout.sats = sats(vout.value, decimals)
    vout.addressTo = derived[0];

    await db.collection("vout").updateOne({
      "addressTo": vout.addressTo,
      "txHash": vout.txHash,
      "n": vout.n
    }, {
      $set: vout
    }, {
      upsert: true
    });
  }
}

// === reorg

function assertBlockN(blockN) {
  if (isNaN(blockN)) {
    throw new Error('blockN must be a number');
  }

  if (blockN < 0) {
    throw new Error('blockN must be more than 0');
  }
}

// return false if no reorg
// return blockN if found need reorg
async function detectReorg(blockN) {
  assertBlockN(blockN);

  let blockHash = await Rpc.getBlockHash(blockN);

  if (!blockHash) {
    throw new Error("Block hash " + blockN + " not found from rpc.");
  }

  const db = Mongo.getClient();

  let vouts = await db.collection("vout").find({
    'blockN': blockN
  }).toArray();

  if (!Array.isArray(vouts)) {
    throw new Error('No vouts found at block ' + blockN);
  }

  let reorg = false;

  for (let i = 0; i < vouts.length; i++) {
    if (vouts[i].blockHash !== blockHash) {
      reorg = true;
      break;
    }
  }

  if (reorg === false) {
    return false;
  }

  return blockN;
}

// return false if no reorg
// return blockN if found need reorg
async function scanReorg(blockN) {
  assertBlockN(blockN);

  // go backwards 10 blocks
  let minBlockN = parseInt(blockN * reorgMin);
  let detected = await detectReorg(blockN);

  while(detected === false) {
    if (blockN < minBlockN) {
      break;
    }

    if (blockN < 0) {
      break;
    }

    detected = await detectReorg(blockN);
    blockN -= 10;
  }

  return detected;
}

async function removeBlockFromN(blockN) {
  const db = Mongo.getClient();

  await db.collection("vin").deleteMany({ 'blockN': { $gte: blockN } });

  await db.collection("vout").deleteMany({ 'blockN': { $gte: blockN } });
}

async function handleReorg(blockN) {
  assertBlockN(blockN);

  console.log('Checking for reorg..');

  let reorgBlockN = await scanReorg(blockN);

  if (reorgBlockN && !isNaN(reorgBlockN)) {
    console.log('Has reorg from block', blockN);
    await removeBlockFromN(blockN);
    await Data.blockHeight(blockN - 1);
  } else {
    console.log("No reorg..");
  }
}

// === start

async function prepare() {
  const db = Mongo.getClient();

  // Create collection and indexes
  let collections = await db.listCollections().toArray();
  let createCollections = [ 'vin', 'vout' ];
  let createCollectionsIndex = {
    "vin": [
      {
        "prev_txid": 1,
        "vout": 1
      },
      {
        "addressFrom": 1,
        "txHash": 1,
        "n": 1
      },
      {
        "addressFrom": 1,
        "blockN": -1,
        "n": 1
      },
      {
        "blockN": -1,
        "n": 1
      }
    ],
    "vout": [
      {
        "blockN": 1
      },
      {
        "addressTo": 1,
        "txHash": 1,
        "n": 1
      },
      {
        "addressTo": 1,
        "blockN": -1,
        "n": 1
      },
      {
        "blockN": -1,
        "n": 1
      }
    ]
  };

  for (let i = 0; i < collections.length; i++) {
    if (collections[i].type === 'collection') {
      let index = createCollections.indexOf(collections[i].name);

      if (index > -1) {
        createCollections.splice(index, 1);
      }
    }
  }

  for (let i = 0; i < createCollections.length; i++) {
    let name = createCollections[i];

    await db.createCollection(name);

    console.log('Created new collection' + name + '.');

    if (createCollectionsIndex[name]) {
      // Create the indexes
      for (let m = 0; m < createCollectionsIndex[name].length; m++) {
        await db.collection(name).createIndex(createCollectionsIndex[name][m]);
        console.log('Collection ' + name + ' is indexed [' + m + '].');
      }
    }
  }
}

async function crawl(bn, maxBn) {
  // console.log('Crawling block ', bn);
  bn = parseInt(bn);
  maxBn = parseInt(maxBn);

  if (crawlerMaxBlock !== false && bn > crawlerMaxBlock) {
    console.log("Crawler max block reached. Terminating..");
    process.exit(0);
  }

  if (bn > maxBn) {
    console.log('Done. Crawler is up to date.');
    await handleReorg(maxBn);
    working = false;
    return;
  }

  working = true;

  let bh = await Rpc.getBlockHash(bn);
  let b = await Rpc.getBlock(bh);

  if (b && Array.isArray(b.tx)) {
    for (let i = 0; i < b.tx.length; i++) {
      let txid = b.tx[i].txid;
      let txHash = b.tx[i].hash;

      for (let m = 0; m < b.tx[i].vin.length; m++) {
        if (!b.tx[i].vin[m].txid) {
          continue;
        }

        b.tx[i].vin[m].prev_txid = b.tx[i].vin[m].txid;

        b.tx[i].vin[m].blockHash = bh;
        b.tx[i].vin[m].blockN = bn;
        b.tx[i].vin[m].txid = txid;
        b.tx[i].vin[m].txHash = txHash;

        if (multithreading) {
          captureVin(b.tx[i].vin[m], m).catch(err => {
            console.log('Capture vin error!', err);
            console.log('At block ', bn);
            process.exit(1);
          });
        } else {
          await captureVin(b.tx[i].vin[m], m);
        }
      }

      for (let m = 0; m < b.tx[i].vout.length; m++) {
        b.tx[i].vout[m].blockHash = bh;
        b.tx[i].vout[m].blockN = bn;
        b.tx[i].vout[m].txid = txid;
        b.tx[i].vout[m].txHash = txHash;

        if (multithreading) {
          captureVout(b.tx[i].vout[m]).catch(err => {
            console.log('Capture vout error!', err);
            console.log('At block ', bn);
            process.exit(1);
          });
        } else {
          await captureVout(b.tx[i].vout[m]);
        }
      }
    }

    await Data.blockHeight(bn + 1);
    await crawl(bn + 1, maxBn);
  }
}

async function start(prep = false) {
  if (prep) {
    await prepare();

    // Begin
    console.log('Network:', process.env.NETWORK);

    setInterval(() => {
      if (working === false) {
        start().catch(err => {
          console.log("Crawler uncought error", err);
        });
      }
    }, 60000 * interval)
  }

  let currentBlockHeight = await Rpc.getBlockCount();
  console.log('Current network block height is', currentBlockHeight);

  // Get saved block height
  let crawlerBlockHeight = await Data.blockHeight();
  console.log('Current crawler block height is', crawlerBlockHeight);

  console.log("Crawling..");
  await crawl(crawlerBlockHeight, currentBlockHeight);
}
