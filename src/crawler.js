"use strict"

const Rpc = require('../src/rpc.js');
const Data = require('../src/data.js');
const Mongo = require('../src/mongodb');

const decimals = parseInt(process.env.DECIMALS);
const multithreading = parseInt(process.env.CRAWLERMULTITHREAD) === 0 ? false : true;

exports.start = start;

async function start() {
  await prepare();

  // Begin
  console.log('Network:', process.env.NETWORK);

  let currentBlockHeight = await Rpc.getBlockCount();
  console.log('Current network block height is', currentBlockHeight);

  // Get saved block height
  let crawlerBlockHeight = await Data.blockHeight();
  console.log('Current crawler block height is', crawlerBlockHeight);

  if (multithreading) {
    console.log("Sprinting!");
    sprint(crawlerBlockHeight, parseInt(currentBlockHeight));
  } else {
    console.log("Crawling..");
    crawl(crawlerBlockHeight, parseInt(currentBlockHeight));
  }
}

async function prepare() {
  const db = Mongo.getClient();

  // Create collection and indexes
  let collections = await db.listCollections().toArray();
  let createCollections = [ 'vin', 'vout' ];
  let createCollectionsIndex = {
    "vin": [
      {
        "addressFrom": 1
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
      }
    ],
    "vout": [
      {
        "addressTo": 1
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

function sprint(bn, maxBn) {
  // console.log('Crawling block ', bn);
  bn = parseInt(bn);

  if (bn === maxBn) {
    console.log('Done. Crawler is up to date.');
    return;
  }

  Rpc.getBlockHash(bn).then(bh => {
    Rpc.getBlock(bh).then(b => {
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

            captureVin(b.tx[i].vin[m], m).catch(err => console.log('Error capturing vin.', err));
          }

          for (let m = 0; m < b.tx[i].vout.length; m++) {
            b.tx[i].vout[m].blockHash = bh;
            b.tx[i].vout[m].blockN = bn;
            b.tx[i].vout[m].txid = txid;
            b.tx[i].vout[m].txHash = txHash;

            captureVout(b.tx[i].vout[m]).catch(err => console.log('Error capturing vout.', err));
          }
        }

        Data.blockHeight(bn + 1).then(() => {
          sprint(bn + 1, maxBn);
        });
      }
    }).catch(err => console.log("Get block hash error", err));
  }).catch(err => console.log("Get block hash error", err));
}

async function crawl(bn, maxBn) {
  // console.log('Crawling block ', bn);
  bn = parseInt(bn);

  if (bn === maxBn) {
    console.log('Done. Crawler is up to date.');
    return;
  }

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

        await captureVin(b.tx[i].vin[m], m);
      }

      for (let m = 0; m < b.tx[i].vout.length; m++) {
        b.tx[i].vout[m].blockHash = bh;
        b.tx[i].vout[m].blockN = bn;
        b.tx[i].vout[m].txid = txid;
        b.tx[i].vout[m].txHash = txHash;

        await captureVout(b.tx[i].vout[m]);
      }
    }

    await Data.blockHeight(bn + 1);
    crawl(bn + 1, maxBn);
  }
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

// if (vout.txid === '2047b293268aa0f5fccfe579cdb40aca7c3f0468a1b044469529a5d99ff44ba8') {}

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

