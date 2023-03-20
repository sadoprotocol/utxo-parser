"use strict"

const Rpc = require('../src/rpc.js');
const Data = require('../src/data.js');
const Mongo = require('../src/mongodb');

const decimals = process.env.DECIMALS;

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

  crawl(crawlerBlockHeight, parseInt(currentBlockHeight));
}

async function prepare() {
  const db = Mongo.getClient();

  // Create collection and indexes
  let collections = await db.listCollections().toArray();
  let createCollections = [ 'vin', 'vout' ];
  let createCollectionsIndex = {
    "vin": {
      "addressFrom": -1
    },
    "vout": {
      "addressTo": -1
    }
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
      // Create the index
      await db.collection(name).createIndex(createCollectionsIndex[name]);
      console.log('Collection ' + name + ' is indexed.');
    }
  }
}

function crawl(bn, maxBn) {
  // console.log('Crawling block ', bn);
  bn = parseInt(bn);

  if (bn === maxBn) {
    console.log('Done. Crawler is up to date.');
    return;
  }

  Rpc.getBlockHash(bn).then(bh => {
    Rpc.getBlock(bh).then(b => {
      if (Array.isArray(b.tx)) {
        for (let i = 0; i < b.tx.length; i++) {
          let txid = b.tx[i].txid;
          let txhash = b.tx[i].hash;

          for (let m = 0; m < b.tx[i].vin.length; m++) {
            if (!b.tx[i].vin[m].txid) {
              continue;
            }

            b.tx[i].vin[m].blockHash = bh;
            b.tx[i].vin[m].blockN = bn;
            b.tx[i].vin[m].txid = txid;
            b.tx[i].vin[m].txhash = txhash;

            captureVin(b.tx[i].vin[m]).catch(err => console.log('Error capturing vin.', err));
          }

          for (let m = 0; m < b.tx[i].vout.length; m++) {
            b.tx[i].vout[m].blockHash = bh;
            b.tx[i].vout[m].blockN = bn;
            b.tx[i].vout[m].txid = txid;
            b.tx[i].vout[m].txhash = txhash;

            captureVout(b.tx[i].vout[m]).catch(err => console.log('Error capturing vout.', err));
          }
        }

        Data.blockHeight(bn + 1).then(() => {
          crawl(bn + 1, maxBn);
        });
      }
    }).catch(err => console.log("Get block hash error", err));
  }).catch(err => console.log("Get block hash error", err));
}

async function captureVin(vin) {
  if (typeof vin.vout === 'undefined') {
    return false;
  }

  let tx = await Rpc.getRawTransaction(vin.txid);
  let index = vin.vout;

  if (tx) {
    let vout = false;

    if (tx.vout[index].n !== index) {
      let foundIndex = tx.vout.findIndex(item => {
        item.n === index;
      });

      vout = tx.vout[foundIndex]
    } else {
      vout = tx.vout[index];
    }

    vin = { ...vin, ...vout };

    console.log('vin', vin);
  }
}

async function captureVout(vout) {

}
